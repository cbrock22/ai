# ESLint Setup Guide

## Auto-Fix on Save (VS Code)

The project is already configured to auto-fix linting issues when you save files in VS Code.

### Setup

1. Make sure you have the ESLint extension installed:
   - Open VS Code
   - Go to Extensions (Ctrl+Shift+X)
   - Search for "ESLint"
   - Install the official ESLint extension

2. The `.vscode/settings.json` is already configured to:
   - Format on save
   - Auto-fix ESLint issues on save

## Manual Lint Fixing

### Command Line

**Check for lint issues:**
```bash
npm run lint
```

**Auto-fix lint issues:**
```bash
npm run lint:fix
```

### Windows Batch Script

Double-click the `lint-fix.bat` file in the frontend folder to automatically fix all linting issues.

## ESLint Configuration

The project uses:
- `react-app` preset (from Create React App)
- Custom rules in `.eslintrc.json`

### Custom Rules

- **no-unused-vars**: Warning (instead of error)
  - Variables starting with `_` are ignored
- **no-console**: Off (console.log allowed)
- **react/prop-types**: Off (no PropTypes required)
- **react-hooks/exhaustive-deps**: Warning

## Common Fixes

### Unused Variables
```javascript
// Warning - unused variable
const data = fetchData();

// Fix - use it or prefix with underscore
const _data = fetchData(); // or remove it
```

### Missing Dependencies in useEffect
```javascript
// Warning
useEffect(() => {
  fetchData(id);
}, []); // 'id' is missing

// Fix
useEffect(() => {
  fetchData(id);
}, [id]); // include all dependencies
```

### Undefined Variables
```javascript
// Error
const handleClick = () => {
  someFunction(); // someFunction is not defined
};

// Fix - define it first
const someFunction = () => { ... };
const handleClick = () => {
  someFunction();
};
```

## Pre-commit Hook (Optional)

To automatically lint before committing:

1. Install husky:
```bash
npm install --save-dev husky lint-staged
```

2. Add to package.json:
```json
{
  "lint-staged": {
    "src/**/*.{js,jsx}": ["eslint --fix", "git add"]
  }
}
```

3. Initialize husky:
```bash
npx husky install
npx husky add .husky/pre-commit "npx lint-staged"
```

## Troubleshooting

### ESLint not working in VS Code

1. Restart VS Code
2. Run: `Developer: Reload Window` (Ctrl+Shift+P)
3. Check Output panel (View > Output) and select "ESLint" from dropdown

### "Cannot find module 'eslint'"

```bash
npm install
```

### Conflicts with Prettier

If you have Prettier installed, add to `.eslintrc.json`:
```json
{
  "extends": [
    "react-app",
    "prettier"
  ]
}
```

## Ignore Files

Create `.eslintignore` to exclude files:
```
build/
node_modules/
*.test.js
```

## Current Project Status

✅ ESLint configured
✅ Auto-fix on save enabled
✅ Manual lint scripts added
✅ Batch script for Windows
✅ Custom rules configured

All components are now lint-error free!
