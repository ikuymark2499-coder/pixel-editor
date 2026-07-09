/**
 * app.js
 * Entry point. Keeps startup wiring minimal: everything real lives in
 * js/ui.js and the modules it coordinates.
 */
import { initUI } from './js/ui.js';
import { initI18n } from './js/i18n.js';

// ฟังก์ชันที่จะทำงานเมื่อ DOM โหลดเสร็จเรียบร้อยแล้ว
function startApp() {
  // 1. รันระบบภาษาเริ่มต้น (ดึงค่าจาก localStorage หรือใช้ 'th') แปลข้อความ static ในหน้าให้เรียบร้อยก่อน
  initI18n();

  // 2. รันระบบ UI หลักของแอป (รวมถึงปุ่มเปลี่ยนภาษาในเมนู ดูฟังก์ชัน wireLanguagePanel ใน js/ui.js)
  initUI();
}

// ตรวจสอบสถานะการโหลดของหน้าเว็บ
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', startApp);
} else {
  startApp();
}
