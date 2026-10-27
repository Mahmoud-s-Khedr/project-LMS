# Domain modules

Domain packages own this directory. Implement each bounded context in its own Nest module, import infrastructure services instead of constructing clients, and register completed modules in `src/app.module.ts` through the scaffolding owner. Cross-domain authorization must use the shared identity/authz contracts.
