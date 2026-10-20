import { describe, expect, it, vi } from 'vitest';
import { isIgnoredRollupWarning, handleRollupWarning } from '../client/vite.config.js';

describe('Vite Rollup Warning Filter', () => {
  it('suppresses known React Router "use client" directive warnings', () => {
    const warningFromReactRouter = {
      code: 'MODULE_LEVEL_DIRECTIVE',
      message: 'Module level directives cause errors when bundled, "use client" in "node_modules/react-router/dist/production/index.js" was ignored.',
      id: 'C:/Users/Abhinay Kandrika/OneDrive/Desktop/gdgc project/node_modules/react-router/dist/production/index.js',
    };

    const warningFromReactRouterDom = {
      code: 'MODULE_LEVEL_DIRECTIVE',
      message: 'Module level directives cause errors when bundled, "use client" in "node_modules/react-router-dom/dist/index.js" was ignored.',
      id: 'C:\\Users\\Abhinay Kandrika\\OneDrive\\Desktop\\gdgc project\\node_modules\\react-router-dom\\dist\\index.js',
    };

    expect(isIgnoredRollupWarning(warningFromReactRouter)).toBe(true);
    expect(isIgnoredRollupWarning(warningFromReactRouterDom)).toBe(true);

    const defaultHandler = vi.fn();
    handleRollupWarning(warningFromReactRouter, defaultHandler);
    expect(defaultHandler).not.toHaveBeenCalled();
  });

  it('passes identical warnings from application source code to the default handler', () => {
    const appWarning = {
      code: 'MODULE_LEVEL_DIRECTIVE',
      message: 'Module level directives cause errors when bundled, "use client" in "client/src/App.jsx" was ignored.',
      id: 'C:/Users/Abhinay Kandrika/OneDrive/Desktop/gdgc project/client/src/App.jsx',
    };

    expect(isIgnoredRollupWarning(appWarning)).toBe(false);

    const defaultHandler = vi.fn();
    handleRollupWarning(appWarning, defaultHandler);
    expect(defaultHandler).toHaveBeenCalledTimes(1);
    expect(defaultHandler).toHaveBeenCalledWith(appWarning);
  });

  it('passes unrelated Rollup warnings through to the default handler', () => {
    const unresolvedWarning = {
      code: 'UNRESOLVED_IMPORT',
      message: "Could not resolve 'missing-pkg' from client/src/main.jsx",
      id: 'C:/Users/Abhinay Kandrika/OneDrive/Desktop/gdgc project/client/src/main.jsx',
    };

    const emptyWarning = {
      code: 'EMPTY_BUNDLE',
      message: 'Generated an empty bundle',
    };

    expect(isIgnoredRollupWarning(unresolvedWarning)).toBe(false);
    expect(isIgnoredRollupWarning(emptyWarning)).toBe(false);

    const defaultHandler = vi.fn();
    handleRollupWarning(unresolvedWarning, defaultHandler);
    expect(defaultHandler).toHaveBeenCalledTimes(1);
    expect(defaultHandler).toHaveBeenCalledWith(unresolvedWarning);
  });
});
