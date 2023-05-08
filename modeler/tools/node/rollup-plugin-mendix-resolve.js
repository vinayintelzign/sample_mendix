const { join, resolve, dirname, normalize, extname, relative, sep, posix } = require("path");
const { existsSync, readFileSync } = require("fs");
const glob = require("glob");


class VariableDynamicImportError extends Error {
}

/* eslint-disable-next-line no-template-curly-in-string */
const example = "For example: import(`./foo/${bar}.js`).";

function sanitizeString(str) {
    if (str.includes("*")) {
        throw new VariableDynamicImportError("A dynamic import cannot contain * characters.");
    }
    return str;
}

function templateLiteralToGlob(node) {
    let glob = "";

    for (let i = 0; i < node.quasis.length; i += 1) {
        glob += sanitizeString(node.quasis[i].value.raw);
        if (node.expressions[i]) {
            glob += expressionToGlob(node.expressions[i]);
        }
    }

    return glob;
}

function callExpressionToGlob(node) {
    const { callee } = node;
    if (
        callee.type === "MemberExpression" &&
        callee.property.type === "Identifier" &&
        callee.property.name === "concat"
    ) {
        return `${expressionToGlob(callee.object)}${node.arguments.map(expressionToGlob).join("")}`;
    }
    return "*";
}

function binaryExpressionToGlob(node) {
    if (node.operator !== "+") {
        throw new VariableDynamicImportError(`${node.operator} operator is not supported.`);
    }

    return `${expressionToGlob(node.left)}${expressionToGlob(node.right)}`;
}

function expressionToGlob(node) {
    switch (node.type) {
        case "TemplateLiteral":
            return templateLiteralToGlob(node);
        case "CallExpression":
            return callExpressionToGlob(node);
        case "BinaryExpression":
            return binaryExpressionToGlob(node);
        case "Literal": {
            return sanitizeString(node.value);
        }
        default:
            return "*";
    }
}

function dynamicImportToGlob(node, sourceString) {
    let glob = expressionToGlob(node);
    if (!glob.includes("*")) {
        return null;
    }
    glob = glob.replace(/\*\*/g, "*");

    if (glob.startsWith("*")) {
        throw new VariableDynamicImportError(
            `invalid import "${sourceString}". It cannot be statically analyzed. Variable dynamic imports must start with ./ and be limited to a specific directory. ${example}`
        );
    }

    if (glob.startsWith("/")) {
        throw new VariableDynamicImportError(
            `invalid import "${sourceString}". Variable absolute imports are not supported, imports must start with ./ in the static part of the import. ${example}`
        );
    }

    if (!glob.startsWith("./") && !glob.startsWith("../")) {
        throw new VariableDynamicImportError(
            `invalid import "${sourceString}". Variable bare imports are not supported, imports must start with ./ in the static part of the import. ${example}`
        );
    }

    if (glob.startsWith("./*.")) {
        throw new VariableDynamicImportError(
            `${`invalid import "${sourceString}". Variable imports cannot import their own directory, ` +
            "place imports in a separate directory or make the import filename more specific. "
            }${example}`
        );
    }

    if (extname(glob) === "") {
        throw new VariableDynamicImportError(
            `invalid import "${sourceString}". A file extension must be included in the static part of the import. ${example}`
        );
    }

    return glob;
}

const relativePath = /^\.?\.\//;
const absolutePath = /^(?:\/|(?:[A-Za-z]:)?[\\|/])/;

function isRelative(path) {
    return relativePath.test(path);
}

function isAbsolute(path) {
    return absolutePath.test(path);
}

const PAGES_GLOB = "./pages/*.js";

module.exports = function (resolutionCachePath, contextPath, cacheTagPath) {
    let cache = {};
    let cacheTag = ""

    function updateCache() {
        if (existsSync(resolutionCachePath)) {
            const resolutionCache = readFileSync(resolutionCachePath, "utf-8");
            const parsed = JSON.parse(resolutionCache);
            for (let key in parsed) {
                const newPart = {
                    ...parsed[key],
                    id: join(contextPath, parsed[key].id)
                };

                cache[join(contextPath, key)] = newPart;
                cache[key] = newPart;
                cache[key.replace(".js", "")] = newPart;

                if (key.endsWith("/index.js")) {
                    cache[key.replace("/index.js", "")] = newPart;
                }
            }
        }
    }

    function updateCacheTag() {
        cacheTag = readFileSync(cacheTagPath, "utf-8");
    }

    updateCache();
    updateCacheTag();

    const ignoreResolve = [
        "\u0000",
        "?commonjs-require",
        "?commonjs-proxy",
        "\x00"
    ];

    return {
        name: "rollup-plugin-mendix-resolve",

        // Resolves direct dependencies inside the deployment folder, as well as node_module dependencies
        resolveId(source, importer) {
            if (ignoreResolve.some(r => source.includes(r))) {
                return null;
            }

            let key = source;
            if (key.startsWith("mendix/") || key === "mendix") {
                key = key.replace("mendix", "mendix-web")
            }

            // Try to resolve from cache
            key = importer && isRelative(key) ? resolve(dirname(importer), key) : key;
            const normalizedKey = normalize(key);

            if (typeof cache[key] !== "undefined") {
                return cache[key];
            } else if (typeof cache[normalizedKey] !== "undefined") {
                return cache[normalizedKey];
            }

            // Don't resolve package imports (e.g. react/mendix-web)
            // We also don't care about the normalizedKey here
            if (isAbsolute(key) || isRelative(key)) {
                const deploymentFolder = process.cwd();
                const relativePath = relative(deploymentFolder, key);

                // Only directly resolve sources that are in the app deployment folder
                if (relativePath.startsWith("..") || isAbsolute(relativePath)) {
                    return null;
                }

                return {
                    id: key.endsWith(".js") || key.endsWith(".mjs") || key.endsWith(".css") ? key : key + ".js"
                };
            }

            return null;
        },

        // Takes care of resolving the dynamic import for pages
        resolveDynamicImport(specifier, importer) {

            if (typeof specifier == "string") {
                const importedFileName = specifier.split("/").reverse()[0];
                return join(contextPath, "mendix-web", importedFileName);
            }

            const deploymentFolder = process.cwd();
            const importGlob = dynamicImportToGlob(specifier);
            if (importGlob === PAGES_GLOB) {
                const files = glob.sync(PAGES_GLOB, { cwd: deploymentFolder });
                files.forEach((f) => {
                    const relativeFileLocation = relative(deploymentFolder, f);
                    this.emitFile({
                        id: relativeFileLocation,
                        fileName: relativeFileLocation,
                        type: "chunk",
                        implicitlyLoadedAfterOneOf: [importer]
                    });

                    cache[relativeFileLocation] = {
                        "external": false,
                        "id": relativeFileLocation,
                        "meta": {},
                        "moduleSideEffects": true,
                        "syntheticNamedExports": false
                    }
                });
                return false;
            }
        },

        // Writes the cachebust for dynamic import for pages
        renderDynamicImport() {
            return {
                left: "import(",
                right: `+ "?${cacheTag}")`
            };
        },

        // Add the resolution cache to the watch files when watching for development
        async buildStart() {
            this.addWatchFile(resolutionCachePath);
            this.addWatchFile(cacheTagPath);
        },

        // Update cache when resolution cache is changed
        watchChange(id) {
            // the paths are registered as unix, but the id is in the platform specific path standard
            const unixPath = id.split(sep).join(posix.sep);

            switch (unixPath) {
                case resolutionCachePath:
                    updateCache();
                    break;
                case cacheTagPath:
                    updateCacheTag();
                    break;
            }
        }
    };
};
