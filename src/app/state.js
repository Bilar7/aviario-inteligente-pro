import { state as v_control } from './state_control.js';
import { state as v_data } from './state_data.js';
import { state as v_editing } from './state_editing.js';
import { state as v_finance } from './state_finance.js';
import { state as v_forms } from './state_forms.js';
import { state as v_navigation } from './state_navigation.js';
import { state as v_preferences } from './state_preferences.js';
import { state as v_profile } from './state_profile.js';
import { state as v_session } from './state_session.js';
import { state as v_ui } from './state_ui.js';

export const state = Object.assign({}, v_control, v_data, v_editing, v_finance, v_forms, v_navigation, v_preferences, v_profile, v_session, v_ui);
