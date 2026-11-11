const join = (...p) => p.filter(Boolean).join('/');
export default { join, dirname: (p) => String(p).split('/').slice(0, -1).join('/') };
