import generateModule from "@babel/generator";
import { parse } from "@babel/parser";
import traverseModule from "@babel/traverse";
import * as t from "@babel/types";

const generate = generateModule.default ?? generateModule;
const traverse = traverseModule.default ?? traverseModule;

const TELEMETRY_IMPORT_SOURCE = "/src/telemetry/runtime";
const SUPPORTED_EXTENSIONS = /\.[cm]?[jt]sx?$/;
const EXCLUDED_PATTERNS = [
  /\.d\.ts$/,
  /\.test\./,
  /\.bench\./,
  /\/src\/telemetry\//,
  // Snapshot readers run during render; recording them invalidates the telemetry
  // snapshot and re-renders forever (see #185).
  /\/src\/ecs\/spawnStats\./,
  /\/src\/vite-env\.d\.ts$/,
];

function normalizeId(id) {
  return id.split("?", 1)[0].replace(/\\/g, "/");
}

function shouldInstrument(id) {
  if (!SUPPORTED_EXTENSIONS.test(id)) {
    return false;
  }

  if (!id.includes("/src/")) {
    return false;
  }

  return !EXCLUDED_PATTERNS.some((pattern) => pattern.test(id));
}

function getRelativeId(id) {
  const srcIndex = id.indexOf("/src/");
  return srcIndex >= 0 ? id.slice(srcIndex + 1) : id;
}

function getBindingName(binding) {
  if (t.isIdentifier(binding)) {
    return binding.name;
  }

  if (t.isRestElement(binding)) {
    return getBindingName(binding.argument);
  }

  if (t.isAssignmentPattern(binding)) {
    return getBindingName(binding.left);
  }

  return "pattern";
}

function getPropertyName(key) {
  if (t.isIdentifier(key)) {
    return key.name;
  }

  if (t.isStringLiteral(key) || t.isNumericLiteral(key) || t.isBigIntLiteral(key)) {
    return String(key.value);
  }

  if (t.isPrivateName(key)) {
    return key.id.name;
  }

  return "computed";
}

function getAssignmentName(left) {
  if (t.isIdentifier(left)) {
    return left.name;
  }

  if (t.isMemberExpression(left) && t.isIdentifier(left.property) && !left.computed) {
    return left.property.name;
  }

  return "assigned";
}

function getDisplayName(path) {
  if ((path.isFunctionDeclaration() || path.isFunctionExpression()) && path.node.id?.name) {
    return path.node.id.name;
  }

  if (path.isObjectMethod() || path.isClassMethod() || path.isClassPrivateMethod()) {
    return getPropertyName(path.node.key);
  }

  const parent = path.parentPath;

  if (parent.isVariableDeclarator()) {
    return getBindingName(parent.node.id);
  }

  if (parent.isAssignmentExpression()) {
    return getAssignmentName(parent.node.left);
  }

  if (parent.isObjectProperty()) {
    return getPropertyName(parent.node.key);
  }

  if (parent.isExportDefaultDeclaration()) {
    return "default";
  }

  return `anonymous@${path.node.loc?.start.line ?? 0}`;
}

function instrumentFunction(path, relativeId) {
  if ((path.isClassMethod() || path.isClassPrivateMethod()) && path.node.kind === "constructor") {
    return;
  }

  const callIdIdentifier = path.scope.generateUidIdentifier("telemetryCallId");
  const errorIdentifier = path.scope.generateUidIdentifier("telemetryError");
  const name = `${relativeId}:${getDisplayName(path)}`;
  const originalBody = t.isBlockStatement(path.node.body)
    ? path.node.body
    : t.blockStatement([t.returnStatement(path.node.body)]);

  const nextBody = t.blockStatement([
    t.variableDeclaration("const", [
      t.variableDeclarator(
        callIdIdentifier,
        t.callExpression(t.identifier("__devTelemetryEnter"), [t.stringLiteral(name)]),
      ),
    ]),
    t.tryStatement(
      t.blockStatement(originalBody.body),
      t.catchClause(
        errorIdentifier,
        t.blockStatement([
          t.expressionStatement(
            t.callExpression(t.identifier("__devTelemetryThrow"), [
              callIdIdentifier,
              errorIdentifier,
            ]),
          ),
          t.throwStatement(errorIdentifier),
        ]),
      ),
      t.blockStatement([
        t.expressionStatement(
          t.callExpression(t.identifier("__devTelemetryExit"), [callIdIdentifier]),
        ),
      ]),
    ),
  ]);
  nextBody.directives = originalBody.directives;

  path.node.body = nextBody;
}

export function devTelemetryVitePlugin() {
  return {
    name: "dev-telemetry-vite-plugin",
    apply: "serve",
    enforce: "pre",
    transform(code, id) {
      const normalizedId = normalizeId(id);
      if (!shouldInstrument(normalizedId)) {
        return null;
      }

      const ast = parse(code, {
        sourceType: "module",
        sourceFilename: normalizedId,
        plugins: ["jsx", "typescript", "classProperties"],
      });

      let mutated = false;
      traverse(ast, {
        FunctionDeclaration: {
          exit(path) {
            instrumentFunction(path, getRelativeId(normalizedId));
            mutated = true;
          },
        },
        FunctionExpression: {
          exit(path) {
            instrumentFunction(path, getRelativeId(normalizedId));
            mutated = true;
          },
        },
        ArrowFunctionExpression: {
          exit(path) {
            instrumentFunction(path, getRelativeId(normalizedId));
            mutated = true;
          },
        },
        ObjectMethod: {
          exit(path) {
            instrumentFunction(path, getRelativeId(normalizedId));
            mutated = true;
          },
        },
        ClassMethod: {
          exit(path) {
            instrumentFunction(path, getRelativeId(normalizedId));
            mutated = true;
          },
        },
        ClassPrivateMethod: {
          exit(path) {
            instrumentFunction(path, getRelativeId(normalizedId));
            mutated = true;
          },
        },
      });

      if (!mutated) {
        return null;
      }

      ast.program.body.unshift(
        t.importDeclaration(
          [
            t.importSpecifier(
              t.identifier("__devTelemetryEnter"),
              t.identifier("__devTelemetryEnter"),
            ),
            t.importSpecifier(
              t.identifier("__devTelemetryExit"),
              t.identifier("__devTelemetryExit"),
            ),
            t.importSpecifier(
              t.identifier("__devTelemetryThrow"),
              t.identifier("__devTelemetryThrow"),
            ),
          ],
          t.stringLiteral(TELEMETRY_IMPORT_SOURCE),
        ),
      );

      const output = generate(
        ast,
        {
          sourceMaps: true,
          sourceFileName: normalizedId,
        },
        code,
      );

      return {
        code: output.code,
        map: output.map,
      };
    },
  };
}
