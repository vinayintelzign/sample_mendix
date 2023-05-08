const { join } = require("path");
const webpack = require("webpack");
const RawModule = require("webpack/lib/RawModule");

module.exports = function (env) {
    const IS_PRODUCTION = env && env.prod;
    const PROJECT_ROOT = env && env.project;
    if (!PROJECT_ROOT) {
        throw new Error("Provide --env.project=path parameter!");
    }

    return {
        devtool: !IS_PRODUCTION ? "inline-source-map" : false,
        mode: IS_PRODUCTION ? "production" : "development",
        entry: {
            jsactions: join(PROJECT_ROOT, "deployment/tmp/jsactions")
        },
        output: {
            path: join(PROJECT_ROOT, "deployment/web"),
            libraryTarget: "amd"
        },
        module: {
            rules: [
                {
                    test: /.js$/,
                    exclude: /node_modules/,
                    use: {
                        loader: "babel-loader",
                        options: {
                            presets: [["@babel/preset-env", { targets: { safari: "13" } }]],
                            plugins: ["@babel/plugin-syntax-dynamic-import"]
                        }
                    }
                }
            ]
        },
        externals: ["big.js"],
        plugins: [
            new webpack.optimize.LimitChunkCountPlugin({ maxChunks: 1 }),
            new EmptyModulePlugin(/react-native/),
            new EmptyModulePlugin(/mx-global/)
        ],
        bail: true,
        parallelism: 2,
        stats: "errors-only"
    };
}

class EmptyModulePlugin {
    constructor(regExp) {
        this.regExp = regExp;
    }

    apply(compiler) {
        compiler.hooks.normalModuleFactory.tap("EmptyModulePlugin", nmf => {
            nmf.hooks.resolve.tap("EmptyModulePlugin", data =>
                this.regExp.test(data.request)
                    ? new RawModule("/* empty */", data.request, data.request + " (ignored module)")
                    : undefined
            );
        });
    }
}
