import AuthenticationServices
import CryptoKit
import Foundation
import Security
import UIKit

/// Signs Pocket Bbokari in to your Google account (read-only: Classroom, Gmail, Drive comments) with your own
/// "iOS" OAuth client from Google Cloud. The sign-in happens on Google's page; only the refresh token is kept, in
/// the iPhone's Keychain. The page asks for Google data through `api(_:)` (no tokens ever reach the page).
final class GoogleLink: NSObject, ASWebAuthenticationPresentationContextProviding {
    static let shared = GoogleLink()

    private let scopes = [
        "openid", "email",
        "https://www.googleapis.com/auth/gmail.readonly",
        "https://www.googleapis.com/auth/classroom.courses.readonly",
        "https://www.googleapis.com/auth/classroom.coursework.me.readonly",
        "https://www.googleapis.com/auth/classroom.announcements.readonly",
        "https://www.googleapis.com/auth/classroom.rosters.readonly",
        "https://www.googleapis.com/auth/drive.readonly",
    ]
    private var session: ASWebAuthenticationSession?
    private var accessToken: String?
    private var expiry = Date.distantPast

    var clientId: String? {
        get { UserDefaults.standard.string(forKey: "google.clientId") }
        set { UserDefaults.standard.set(newValue, forKey: "google.clientId") }
    }
    var email: String? {
        get { UserDefaults.standard.string(forKey: "google.email") }
        set { UserDefaults.standard.set(newValue, forKey: "google.email") }
    }
    var connected: Bool { clientId != nil && Keychain.read("google.refresh") != nil }

    /// "123-abc.apps.googleusercontent.com" → "com.googleusercontent.apps.123-abc" (Google's redirect for iOS clients).
    private func scheme(for id: String) -> String {
        "com.googleusercontent.apps." + id.replacingOccurrences(of: ".apps.googleusercontent.com", with: "")
    }

    func presentationAnchor(for session: ASWebAuthenticationSession) -> ASPresentationAnchor {
        UIApplication.shared.connectedScenes.compactMap { ($0 as? UIWindowScene)?.keyWindow }.first ?? ASPresentationAnchor()
    }

    /// Opens Google's sign-in page and waits for "Allow". Returns your email.
    func connect(clientId id: String) async throws -> String {
        let cleanId = id.trimmingCharacters(in: .whitespacesAndNewlines)
        guard cleanId.hasSuffix(".apps.googleusercontent.com") else { throw LinkError.message("That doesn’t look like a Google iOS client ID (it ends in .apps.googleusercontent.com).") }
        let verifier = Self.random(48)
        let challenge = Data(SHA256.hash(data: Data(verifier.utf8))).base64URL
        let redirect = scheme(for: cleanId) + ":/oauth2redirect"
        var url = URLComponents(string: "https://accounts.google.com/o/oauth2/v2/auth")!
        url.queryItems = [
            .init(name: "client_id", value: cleanId), .init(name: "redirect_uri", value: redirect),
            .init(name: "response_type", value: "code"), .init(name: "scope", value: scopes.joined(separator: " ")),
            .init(name: "code_challenge", value: challenge), .init(name: "code_challenge_method", value: "S256"),
            .init(name: "access_type", value: "offline"), .init(name: "prompt", value: "consent"),
        ]
        let callback: URL = try await withCheckedThrowingContinuation { cont in
            DispatchQueue.main.async {
                let s = ASWebAuthenticationSession(url: url.url!, callbackURLScheme: self.scheme(for: cleanId)) { result, error in
                    if let result { cont.resume(returning: result) } else { cont.resume(throwing: error ?? LinkError.message("Sign-in didn’t finish.")) }
                }
                s.presentationContextProvider = self
                s.prefersEphemeralWebBrowserSession = false
                self.session = s
                s.start()
            }
        }
        guard let code = URLComponents(url: callback, resolvingAgainstBaseURL: false)?.queryItems?.first(where: { $0.name == "code" })?.value else {
            throw LinkError.message("Google didn’t send a sign-in code.")
        }
        let tokens = try await tokenRequest(["client_id": cleanId, "code": code, "code_verifier": verifier, "grant_type": "authorization_code", "redirect_uri": redirect])
        guard let refresh = tokens["refresh_token"] as? String else { throw LinkError.message("Google didn’t send a refresh token. Try again.") }
        clientId = cleanId
        Keychain.save("google.refresh", refresh)
        remember(tokens)
        let (_, info) = await api("https://openidconnect.googleapis.com/v1/userinfo")
        let mail = (try? JSONSerialization.jsonObject(with: Data(info.utf8)) as? [String: Any])?["email"] as? String ?? "Google"
        email = mail
        return mail
    }

    func disconnect() {
        Keychain.delete("google.refresh")
        accessToken = nil
        email = nil
    }

    /// A Google API GET request with your sign-in. Returns (HTTP status, body text).
    func api(_ link: String) async -> (Int, String) {
        guard let url = URL(string: link), url.host?.hasSuffix("googleapis.com") == true else { return (400, "{\"error\":\"only Google APIs\"}") }
        do {
            var req = URLRequest(url: url)
            req.setValue("Bearer \(try await token())", forHTTPHeaderField: "Authorization")
            let (data, res) = try await URLSession.shared.data(for: req)
            return ((res as? HTTPURLResponse)?.statusCode ?? 0, String(data: data, encoding: .utf8) ?? "")
        } catch {
            return (401, "{\"error\":\"\(error.localizedDescription.replacingOccurrences(of: "\"", with: "'"))\"}")
        }
    }

    private func token() async throws -> String {
        if let t = accessToken, Date() < expiry { return t }
        guard let id = clientId, let refresh = Keychain.read("google.refresh") else { throw LinkError.message("not signed in") }
        let tokens = try await tokenRequest(["client_id": id, "refresh_token": refresh, "grant_type": "refresh_token"])
        remember(tokens)
        guard let t = accessToken else { throw LinkError.message("no token") }
        return t
    }

    private func remember(_ tokens: [String: Any]) {
        accessToken = tokens["access_token"] as? String
        expiry = Date().addingTimeInterval(Double(tokens["expires_in"] as? Int ?? 3600) - 60)
    }

    private func tokenRequest(_ params: [String: String]) async throws -> [String: Any] {
        var req = URLRequest(url: URL(string: "https://oauth2.googleapis.com/token")!)
        req.httpMethod = "POST"
        req.setValue("application/x-www-form-urlencoded", forHTTPHeaderField: "Content-Type")
        var form = URLComponents()
        form.queryItems = params.map { URLQueryItem(name: $0.key, value: $0.value) }
        req.httpBody = form.percentEncodedQuery?.replacingOccurrences(of: "+", with: "%2B").data(using: .utf8)
        let (data, res) = try await URLSession.shared.data(for: req)
        let json = (try? JSONSerialization.jsonObject(with: data) as? [String: Any]) ?? [:]
        if (res as? HTTPURLResponse)?.statusCode != 200 {
            if params["grant_type"] == "refresh_token" { disconnect() }
            throw LinkError.message(json["error_description"] as? String ?? json["error"] as? String ?? "Google said no.")
        }
        return json
    }

    private static func random(_ n: Int) -> String {
        var bytes = [UInt8](repeating: 0, count: n)
        _ = SecRandomCopyBytes(kSecRandomDefault, n, &bytes)
        return Data(bytes).base64URL
    }

    enum LinkError: LocalizedError {
        case message(String)
        var errorDescription: String? { if case .message(let m) = self { return m }; return nil }
    }
}

private extension Data {
    var base64URL: String {
        base64EncodedString().replacingOccurrences(of: "+", with: "-").replacingOccurrences(of: "/", with: "_").replacingOccurrences(of: "=", with: "")
    }
}

/// A tiny Keychain wrapper (this iPhone only).
enum Keychain {
    static func save(_ key: String, _ value: String) {
        delete(key)
        let q: [String: Any] = [kSecClass as String: kSecClassGenericPassword, kSecAttrAccount as String: key, kSecValueData as String: Data(value.utf8), kSecAttrAccessible as String: kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly]
        SecItemAdd(q as CFDictionary, nil)
    }
    static func read(_ key: String) -> String? {
        let q: [String: Any] = [kSecClass as String: kSecClassGenericPassword, kSecAttrAccount as String: key, kSecReturnData as String: true, kSecMatchLimit as String: kSecMatchLimitOne]
        var out: AnyObject?
        guard SecItemCopyMatching(q as CFDictionary, &out) == errSecSuccess, let data = out as? Data else { return nil }
        return String(data: data, encoding: .utf8)
    }
    static func delete(_ key: String) {
        SecItemDelete([kSecClass as String: kSecClassGenericPassword, kSecAttrAccount as String: key] as CFDictionary)
    }
}
