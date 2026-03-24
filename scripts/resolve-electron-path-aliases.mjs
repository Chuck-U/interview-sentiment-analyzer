import { promises as fs } from "node:fs";
import path from "node:path";
import process from "node:process";

const projectRoot = process.cwd();
const tsconfigPath = path.resolve(projectRoot, "tsconfig.electron.json");
// Temp solution to fix path alias before configuring in electron-builder
const MODULE_SPECIFIER_PATTERN =
  /(\brequire\(\s*["'])([^"']+)(["']\s*\))|(\bfrom\s*["'])([^"']+)(["'])|(\bimport\(\s*["'])([^"']+)(["']\s*\))/g;

async function readJsonFile(filePath) {
  const raw = await fs.readFile(filePath, "utf8");
  return JSON.parse(raw);
}

function mergeCompilerOptions(baseConfig, config) {
  const baseCompilerOptions = baseConfig.compilerOptions ?? {};
  const compilerOptions = config.compilerOptions ?? {};

  return {
    ...baseCompilerOptions,
    ...compilerOptions,
    paths: {
      ...(baseCompilerOptions.paths ?? {}),
      ...(compilerOptions.paths ?? {}),
    },
  };
}

async function loadTsConfig(configFilePath, visited = new Set()) {
  const normalizedPath = path.normalize(configFilePath);
  if (visited.has(normalizedPath)) {
    throw new Error(`Circular tsconfig extends detected at ${configFilePath}`);
  }
  visited.add(normalizedPath);

  const config = await readJsonFile(configFilePath);
  const extendsValue = config.extends;

  if (!extendsValue) {
    return { ...config, compilerOptions: config.compilerOptions ?? {} };
  }

  const parentConfigPath = path.resolve(
    path.dirname(configFilePath),
    extendsValue.endsWith(".json") ? extendsValue : `${extendsValue}.json`
  );
  const baseConfig = await loadTsConfig(parentConfigPath, visited);

  return {
    ...baseConfig,
    ...config,
    compilerOptions: mergeCompilerOptions(baseConfig, config),
  };
}

function buildAliasRules(pathsConfig) {
  const rules = [];
  for (const [aliasPattern, targetPatterns] of Object.entries(pathsConfig ?? {})) {
    if (!Array.isArray(targetPatterns) || targetPatterns.length === 0) {
      continue;
    }

    const primaryTarget = targetPatterns[0];
    const aliasHasWildcard = aliasPattern.endsWith("/*");
    const targetHasWildcard = primaryTarget.endsWith("/*");

    if (aliasHasWildcard !== targetHasWildcard) {
      continue;
    }

    if (aliasHasWildcard) {
      rules.push({
        type: "wildcard",
        aliasPrefix: aliasPattern.slice(0, -1),
        targetPrefix: primaryTarget.slice(0, -1),
      });
      continue;
    }

    rules.push({
      type: "exact",
      aliasPattern,
      targetPath: primaryTarget,
    });
  }

  rules.sort((a, b) => {
    const aLength =
      a.type === "wildcard" ? a.aliasPrefix.length : a.aliasPattern.length;
    const bLength =
      b.type === "wildcard" ? b.aliasPrefix.length : b.aliasPattern.length;
    return bLength - aLength;
  });

  return rules;
}

function resolveAlias(specifier, rules) {
  for (const rule of rules) {
    if (rule.type === "wildcard") {
      if (specifier.startsWith(rule.aliasPrefix)) {
        const suffix = specifier.slice(rule.aliasPrefix.length);
        return `${rule.targetPrefix}${suffix}`;
      }
      continue;
    }

    if (specifier === rule.aliasPattern) {
      return rule.targetPath;
    }
  }
  return null;
}

async function listJavaScriptFiles(targetDir) {
  const results = [];

  async function walk(currentDir) {
    const entries = await fs.readdir(currentDir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(currentDir, entry.name);
      if (entry.isDirectory()) {
        await walk(fullPath);
        continue;
      }
      if (/\.(js|cjs|mjs)$/.test(entry.name)) {
        results.push(fullPath);
      }
    }
  }

  await walk(targetDir);
  return results;
}

function toImportPath(filePath) {
  const normalized = filePath.replace(/\\/g, "/");
  return normalized.startsWith(".") ? normalized : `./${normalized}`;
}

function rewriteModuleSpecifiers(
  fileContent,
  filePath,
  rules,
  sourceRoot,
  emittedRoot
) {
  let replacements = 0;

  const updatedContent = fileContent.replace(
    MODULE_SPECIFIER_PATTERN,
    (
      fullMatch,
      requirePrefix,
      requireSpecifier,
      requireSuffix,
      fromPrefix,
      fromSpecifier,
      fromSuffix,
      dynamicPrefix,
      dynamicSpecifier,
      dynamicSuffix
    ) => {
      const specifier =
        requireSpecifier ?? fromSpecifier ?? dynamicSpecifier ?? null;
      if (!specifier) {
        return fullMatch;
      }
      if (
        specifier.startsWith(".") ||
        specifier.startsWith("/") ||
        specifier.startsWith("node:")
      ) {
        return fullMatch;
      }

      const mappedSourcePath = resolveAlias(specifier, rules);
      if (!mappedSourcePath) {
        return fullMatch;
      }

      const sourceAbsolutePath = path.resolve(sourceRoot, mappedSourcePath);
      const emittedAbsolutePath = path.resolve(
        emittedRoot,
        path.relative(sourceRoot, sourceAbsolutePath)
      );

      const relativeSpecifier = toImportPath(
        path.relative(path.dirname(filePath), emittedAbsolutePath)
      );
      replacements += 1;

      if (requireSpecifier) {
        return `${requirePrefix}${relativeSpecifier}${requireSuffix}`;
      }
      if (fromSpecifier) {
        return `${fromPrefix}${relativeSpecifier}${fromSuffix}`;
      }
      return `${dynamicPrefix}${relativeSpecifier}${dynamicSuffix}`;
    }
  );

  return { updatedContent, replacements };
}

async function main() {
  const config = await loadTsConfig(tsconfigPath);
  const compilerOptions = config.compilerOptions ?? {};
  const pathsConfig = compilerOptions.paths ?? {};

  const rules = buildAliasRules(pathsConfig);
  if (rules.length === 0) {
    console.log("[alias-fix] No path aliases found. Skipping.");
    return;
  }

  const baseUrl = compilerOptions.baseUrl ?? ".";
  const rootDir = compilerOptions.rootDir ?? ".";
  const outDir = compilerOptions.outDir ?? "dist-electron";

  const sourceRoot = path.resolve(projectRoot, baseUrl, rootDir);
  const emittedRoot = path.resolve(projectRoot, outDir);

  let files = [];
  try {
    files = await listJavaScriptFiles(emittedRoot);
  } catch (error) {
    if (error && error.code === "ENOENT") {
      console.log("[alias-fix] Emit directory not found. Skipping.");
      return;
    }
    throw error;
  }

  let changedFiles = 0;
  let totalReplacements = 0;

  for (const filePath of files) {
    const originalContent = await fs.readFile(filePath, "utf8");
    const { updatedContent, replacements } = rewriteModuleSpecifiers(
      originalContent,
      filePath,
      rules,
      sourceRoot,
      emittedRoot
    );

    if (replacements > 0 && updatedContent !== originalContent) {
      await fs.writeFile(filePath, updatedContent, "utf8");
      changedFiles += 1;
      totalReplacements += replacements;
    }
  }

  console.log(
    `[alias-fix] Rewrote ${totalReplacements} alias import(s) across ${changedFiles} file(s).`
  );
}

main().catch((error) => {
  console.error("[alias-fix] Failed:", error);
  process.exit(1);
});
