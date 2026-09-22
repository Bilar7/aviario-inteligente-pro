import { state } from './state.js';
import { methods as auth } from './methods_auth.js';
import { methods as core } from './methods_core.js';
import { methods as data } from './methods_data.js';
import { methods as day } from './methods_day.js';
import { methods as finance_actions } from './methods_finance_actions.js';
import { methods as finance_core } from './methods_finance_core.js';
import { methods as misc } from './methods_misc.js';
import { methods as modals } from './methods_modals.js';
import { methods as ops_exports } from './methods_ops_exports.js';
import { methods as ops_production } from './methods_ops_production.js';
import { methods as ui } from './methods_ui.js';
import { methods as automation } from './methods_automation.js';
import { methods as management } from './methods_management.js';

export function createAppState() {
  return {
    ...state,
    ...auth,
    ...core,
    ...data,
    ...day,
    ...finance_actions,
    ...finance_core,
    ...misc,
    ...modals,
    ...ops_exports,
    ...ops_production,
    ...ui,
    ...automation,
    ...management
  };
}

export { createAppState as aviarioApp };
