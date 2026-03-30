/**
 * Centralized Odoo UI selectors.
 * Update these when Odoo changes its UI.
 * Supports Odoo 16, 17, 18.
 */

export const SELECTORS = {
  // === Login Page ===
  login: {
    // Login form fields
    usernameInput: 'input[id="login"], input[name="login"]',
    passwordInput: 'input[id="password"], input[name="password"]',
    submitButton: 'button[type="submit"], .btn-primary[type="submit"]',
    // Database selector (some Odoo instances require this)
    databaseSelect: 'select[name="db"], #db',
    // Error message
    errorAlert: '.alert-danger, .o_login_error',
  },

  // === Attendance Page ===
  attendance: {
    // The main check-in / check-out button
    // Odoo 16/17: Usually a large button in the attendance view
    checkinButton: [
      'button:has-text("Check in")',
      'button:has-text("Check In")',
      '.o_hr_attendance_sign_in_out_icon',
      '.o_hr_attendance_kiosk_mode button.btn-primary',
      'button.o_hr_attendance_sign_in_out_icon',
      'a:has-text("Check in")',
    ],
    checkoutButton: [
      'button:has-text("Check out")',
      'button:has-text("Check Out")',
      '.o_hr_attendance_sign_in_out_icon',
      'button.o_hr_attendance_sign_in_out_icon',
      'a:has-text("Check out")',
    ],
    // Combined button (some Odoo versions use one toggle button)
    toggleButton: [
      '.o_hr_attendance_sign_in_out_icon',
      'button.btn-primary.o_hr_attendance',
      '.o_hr_attendance_kiosk_mode .btn-primary',
    ],
    // Status text that tells us if we are checked in or not
    statusText: [
      '.o_hr_attendance_status',
      '.o_hr_attendance_kiosk_mode h1',
      '.o_hr_attendance_result',
    ],
    // Kiosk mode identifiers
    kioskContainer: '.o_hr_attendance_kiosk_mode',
  },

  // === Navigation ===
  nav: {
    attendanceMenu: [
      'a[data-menu-xmlid="hr_attendance.menu_hr_attendance_root"]',
      'a:has-text("Attendances")',
      '.o_menu_entry_lvl_1:has-text("Attendances")',
      'a[href*="/odoo/attendances"]',
      'a[href*="/web#action=hr_attendance"]',
    ],
    // Top bar attendance button (some configs show a small button)
    topBarAttendance: [
      '.o_hr_attendance_my_attendances',
      'a[href*="attendance"]',
    ],
  },

  // === General ===
  general: {
    loadingSpinner: '.o_loading, .o_blockUI',
    mainContent: '.o_content, .o_action_manager',
    appMenu: '.o_navbar_apps_menu, .o_home_menu',
  },
} as const;

/**
 * Try multiple selectors and return the first match
 */
export function getFirstSelector(selectors: readonly string[]): string {
  return selectors.join(', ');
}
