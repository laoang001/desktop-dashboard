/// <reference types="vite/client" />

declare module '*.vue' {
  import type { DefineComponent } from 'vue';
  const component: DefineComponent<{}, {}, any>;
  export default component;
}

// sql.js wasm 文件以 url 形式导入（Vite 构建时处理路径）
declare module '*.wasm?url' {
  const url: string;
  export default url;
}
