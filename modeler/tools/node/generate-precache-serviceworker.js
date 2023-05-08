const crypto = require("crypto");
const fs = require("fs");
const path = require("path");

function generatePrecacheServiceWorker(options) {
    return {
        name: "generate-precache-serviceworker",
        async generateBundle(_, bundles) {
            const serviceWorkerPath = path.join(options.deploymentDir, "web", "service-worker.js");

            const precacheEntries = {
                html: await findStaticDeploymentFiles(options.deploymentDir, ".html"),
                generic: (
                    await findStaticDeploymentFiles(options.deploymentDir, ".json", ".css", ".js", ".woff2", ".woff", ".svg")
                ).concat([
                    await generateCacheEntry(options.deploymentDir, "dist/index.js"),
                    await generateCacheEntry(options.deploymentDir, "dist/commons.js"),
                ]),
                profiles: [],
            };

            const additionalPrecacheEntries = await Promise.all(
                Object.keys(bundles).map((p) => generateCacheEntry(options.deploymentDir, path.join("dist", p)))
            );

            let text = (await fs.promises.readFile(serviceWorkerPath)).toString();
            text = text.replace("INJECTED_PRECACHE_ENTRIES", JSON.stringify(precacheEntries));
            text = text.replace("ADDITIONAL_PRE_CACHE_ENTRIES", JSON.stringify(additionalPrecacheEntries));
            await fs.promises.writeFile(serviceWorkerPath, text);
        },
    };
}

async function findStaticDeploymentFiles(deploymentDir, ...extensions) {
    const ignoredPaths = [
        "preview",
        "pages",
        "layouts",
        "package.json",
        "rollup.config.js",
        "index.js",
        "service-worker.js",
    ];
    const foundFiles = [];

    async function walkDir(dir) {
        const items = await fs.promises.readdir(path.join(deploymentDir, "web", dir), { withFileTypes: true });

        for (const item of items) {
            const localPath = path.join(dir, item.name);
            if (ignoredPaths.includes(localPath)) {
                continue;
            }

            if (item.isDirectory()) {
                await walkDir(localPath);
            } else if (extensions.some((e) => item.name.endsWith(e))) {
                foundFiles.push(localPath);
            }
        }
    }

    await walkDir("");

    return Promise.all(foundFiles.map((f) => generateCacheEntry(deploymentDir, f)));
}

async function generateCacheEntry(deploymentDir, file) {
    let revision = null;
    if (file.endsWith(".html") || file.endsWith(".woff2") || file.endsWith(".woff")) {
        const fullPath = path.join(deploymentDir, "web", file);
        const text = (await fs.promises.readFile(fullPath)).toString();
        revision = crypto.createHash("md5").update(text).digest("hex");
    }

    return {
        url: file.split(path.sep).join(path.posix.sep),
        revision,
    };
}

module.exports = generatePrecacheServiceWorker;
