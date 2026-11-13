const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

function createNotice(packageJson, depTree, readPackage, currentDate = new Date().toISOString().split('T')[0]) {
    const production = new Set(Object.keys(packageJson.dependencies || {}));
    const development = new Set(Object.keys(packageJson.devDependencies || {}));
    const packages = new Map();
    const categories = new Map();

    // Classify exact direct versions, including scoped package names.
    for (const [name, info] of Object.entries(depTree.dependencies || {})) {
        if (production.has(name)) categories.set(`${name}@${info.version}`, 'production');
        else if (development.has(name)) categories.set(`${name}@${info.version}`, 'development');
    }

    function walk(tree) {
        for (const [name, info] of Object.entries(tree.dependencies || {})) {
            // npm includes empty entries for optional packages absent on this platform.
            if (!info.version) continue;
            const key = `${name}@${info.version}`;
            if (!packages.has(key)) packages.set(key, readPackage(info.path));
            // Repeated versions may expose different nested dependencies.
            walk(info);
        }
    }
    walk(depTree);

    function entries(category) {
        return [...packages.keys()].sort().filter(key =>
            (categories.get(key) || 'indirect') === category
        ).map(key => {
            const pkg = packages.get(key);
            const license = pkg.license || pkg.licenses;
            const licenseText = Array.isArray(license)
                ? license.map(item => typeof item === 'string' ? item : item.type).join(' OR ')
                : typeof license === 'string' ? license : license?.type;
            const repository = typeof pkg.repository === 'string' ? pkg.repository : pkg.repository?.url;
            return `Package: ${key}
License: ${licenseText || 'UNKNOWN'}
Repository: ${repository || 'UNKNOWN'}

`;
        }).join('');
    }

    let notice = `================================================================================

THIRD_PARTY_LICENSES.txt for swayer

================================================================================

This product uses software developed by other open source projects.
The following is a list of the open source software packages used in this product,
along with their license information.

Generated on: ${currentDate}

================================================================================
DIRECT DEPENDENCIES
================================================================================

`;

    notice += `PRODUCTION
--------------------------------------------------------------------------------
${entries('production')}DEVELOPMENT (not in production)
--------------------------------------------------------------------------------
${entries('development')}================================================================================
INDIRECT DEPENDENCIES (Transitive Dependencies)
================================================================================

${entries('indirect')}================================================================================
`;
    return notice;
}

if (require.main === module) {
    const packageJson = JSON.parse(fs.readFileSync('package.json', 'utf8'));
    const args = ['ls', '--all', '--long', '--json', '--include=dev', '--include=optional'];
    const depTree = JSON.parse(process.env.npm_execpath
        ? execFileSync(process.execPath, [process.env.npm_execpath, ...args], { maxBuffer: 32 * 1024 * 1024 })
        : execFileSync('npm', args, { maxBuffer: 32 * 1024 * 1024 }));
    const notice = createNotice(packageJson, depTree, packagePath =>
        JSON.parse(fs.readFileSync(path.join(packagePath, 'package.json'), 'utf8'))
    );
    fs.writeFileSync('THIRD_PARTY_LICENSES.txt', notice);
    console.log('Categorized THIRD_PARTY_LICENSES.txt file generated successfully.');
}

module.exports = { createNotice };
