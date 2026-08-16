import ts from 'typescript-eslint'

// 纯后端仓库:Vue 前端已移除,React 前端在 pigzwy/pig-studio 有自己的 eslint 配置
export default ts.config(
  ...ts.configs.recommended,
  {
    rules: {
      '@typescript-eslint/no-explicit-any': 'off'
    }
  }
)
