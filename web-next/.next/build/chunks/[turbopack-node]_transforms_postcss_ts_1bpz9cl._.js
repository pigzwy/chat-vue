module.exports = [
"[turbopack-node]/transforms/postcss.ts?config=[project]/web-next/postcss.config.mjs { CONFIG => \"[project]/web-next/postcss.config.mjs [postcss] (ecmascript)\" } [postcss] (ecmascript, async loader)", ((__turbopack_context__) => {

__turbopack_context__.v((parentImport) => {
    return Promise.all([
  "chunks/16v9__pnpm_08e9xk8._.js",
  "chunks/[root-of-the-server]__1gzc95w._.js"
].map((chunk) => __turbopack_context__.l(chunk))).then(() => {
        return parentImport("[turbopack-node]/transforms/postcss.ts?config=[project]/web-next/postcss.config.mjs { CONFIG => \"[project]/web-next/postcss.config.mjs [postcss] (ecmascript)\" } [postcss] (ecmascript)");
    });
});
}),
];