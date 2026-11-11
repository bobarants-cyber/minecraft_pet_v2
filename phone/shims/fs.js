// Phone stand-in for node:fs: nothing is read from files (saved data lives in the phone's localStorage instead).
const nope = () => { throw new Error('no files on the phone'); };
export default { readFileSync: nope, writeFileSync() {}, mkdirSync() {}, existsSync: () => false, statSync: nope, readdirSync: () => [] };
