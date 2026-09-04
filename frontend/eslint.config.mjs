import tsParser from "@typescript-eslint/parser";

/**
 * app / features / shared は external/handler を境界として利用する。
 * service 以下へ直接アクセスさせない。
 */
const noExternalLayerSkipping = {
  regex:
    "^(?:@/external/(?:service|repository|domain|client)(?:/|$)|(?:\\.\\./)+external/(?:service|repository|domain|client)(?:/|$))",
  message:
    "app/features/shared から external の内部レイヤーへ直接アクセスしないでください。external/handler 経由でアクセスしてください。",
};

export default [
  {
    ignores: [".next/**", "node_modules/**", "out/**", "build/**"],
  },

  // TypeScriptをESLintで解析するためだけに使用。
  // type-aware lintingは行わない。
  {
    files: ["src/**/*.{ts,tsx}"],
    languageOptions: {
      parser: tsParser,
    },
  },

  // app / features / shared → external/service, repository, domain, client を禁止
  {
    files: [
      "src/app/**/*.{ts,tsx}",
      "src/features/**/*.{ts,tsx}",
      "src/shared/**/*.{ts,tsx}",
    ],
    rules: {
      "no-restricted-imports": ["error", { patterns: [noExternalLayerSkipping] }],
    },
  },

  // external/domain は他レイヤーに一切依存できない(CLAUDE.md アーキテクチャ規約)
  {
    files: ["src/external/domain/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              regex:
                "^(?:@/external/(?:service|repository|handler|client|dto)(?:/|$)|(?:\\.\\./)+(?:service|repository|handler|client|dto)(?:/|$))",
              message:
                "external/domain は他レイヤー(service/repository/handler/client/dto)に依存できません。CLAUDE.md「アーキテクチャ規約」参照。",
            },
          ],
        },
      ],
    },
  },

  // handler → repository/domain/client への飛び越し禁止
  {
    files: ["src/external/handler/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              regex:
                "^(?:@/external/(?:repository|domain|client)(?:/|$)|(?:\\.\\./)+(?:repository|domain|client)(?:/|$))",
              message:
                "handler から repository/domain/client へ直接アクセスしないでください。service 経由でアクセスしてください。",
            },
          ],
        },
      ],
    },
  },

  // service → client/handler/dto への依存禁止(DbClient型のimportも含めて全面禁止。既知の違反はnote-service.ts/template-service.ts側でeslint-disableにより個別除外)
  {
    files: ["src/external/service/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              regex:
                "^(?:@/external/(?:client|handler|dto)(?:/|$)|(?:\\.\\./)+(?:client|handler|dto)(?:/|$))",
              message:
                "service は client/handler/dto に依存できません。DB操作はrepository経由、DTO変換はhandler側で行ってください。",
            },
          ],
        },
      ],
    },
  },

  // repository → service/handler/dto への依存禁止
  {
    files: ["src/external/repository/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              regex:
                "^(?:@/external/(?:service|handler|dto)(?:/|$)|(?:\\.\\./)+(?:service|handler|dto)(?:/|$))",
              message:
                "repository は service/handler/dto に依存できません。移行時にバックエンドへそのまま移管する層です。",
            },
          ],
        },
      ],
    },
  },

  // dto → repository/handler/client への依存禁止(domain・serviceは許可。note-dto.tsが既にserviceに依存する既存パターン)
  {
    files: ["src/external/dto/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              regex:
                "^(?:@/external/(?:repository|handler|client)(?:/|$)|(?:\\.\\./)+(?:repository|handler|client)(?:/|$))",
              message: "dto は repository/handler/client に直接依存できません。",
            },
          ],
        },
      ],
    },
  },
];
