import th from "./lang/th.js";
import en from "./lang/en.js";

const languages = {
    th,
    en
};

let currentLanguage = "th";
const listeners = [];

// ฟังก์ชันสำหรับสลับภาษา
export function setLanguage(lang) {
    if (languages[lang]) {
        currentLanguage = lang;
        updateTexts();
        listeners.forEach((cb) => cb(currentLanguage));
    }
}

// คืนค่าภาษาที่ใช้งานอยู่ตอนนี้ ('th' หรือ 'en')
export function getLanguage() {
    return currentLanguage;
}

// ให้โมดูลอื่น (เช่น ui.js) ลงทะเบียนรับรู้เมื่อผู้ใช้เปลี่ยนภาษา
// เพื่อไปอัปเดตข้อความที่สร้างด้วย JS เอง (เช่น toast, ชื่อเลเยอร์ default)
export function onLanguageChange(callback) {
    listeners.push(callback);
}

// ฟังก์ชันช่วยดึงคำแปลจาก Key (เอาไว้ใช้ใน JS ตัวอื่นได้ด้วย เช่น t('tool_pencil'))
// รองรับการแทนค่าตัวแปรในข้อความด้วย {name} เช่น t('toast_project_opened', { name: 'cat' })
export function t(key, vars) {
    let str = languages[currentLanguage][key] ?? key;
    if (vars) {
        for (const [k, v] of Object.entries(vars)) {
            str = str.replace(new RegExp(`\\{${k}\\}`, "g"), v);
        }
    }
    return str;
}

// ฟังก์ชันหลักในการกวาดเปลี่ยนภาษาทั่วทั้งหน้า HTML
function updateTexts() {
    // 1. เปลี่ยนข้อความด้านใน Element (เช่น <h2>, <span>, <button>)
    document.querySelectorAll("[data-i18n]").forEach(element => {
        const key = element.getAttribute("data-i18n");
        element.textContent = t(key);
    });

    // 2. เปลี่ยนข้อความใน Attribute 'title' (คำใบ้ตอนเอาเมาส์ไปชี้ปุ่ม)
    document.querySelectorAll("[data-i18n-title]").forEach(element => {
        const key = element.getAttribute("data-i18n-title");
        element.setAttribute("title", t(key));
    });

    // 3. เปลี่ยนข้อความใน Attribute 'placeholder' (ข้อความจางๆ ในช่อง Input)
    document.querySelectorAll("[data-i18n-placeholder]").forEach(element => {
        const key = element.getAttribute("data-i18n-placeholder");
        element.setAttribute("placeholder", t(key));
    });

    // 4. เปลี่ยนข้อความใน Attribute 'aria-label' (สำหรับระบบอ่านหน้าจอของผู้พิการ)
    document.querySelectorAll("[data-i18n-aria-label]").forEach(element => {
        const key = element.getAttribute("data-i18n-aria-label");
        element.setAttribute("aria-label", t(key));
    });
}

// ฟังก์ชันสำหรับรันตอนเริ่มแอปครั้งแรก (เลือกภาษาเริ่มต้น)
export function initI18n() {
    // โหลดภาษาที่เคยเลือกไว้จาก localStorage (ถ้าไม่มีให้ใช้ 'th' เป็นค่าเริ่มต้น)
    const savedLang = localStorage.getItem("app_lang") || "th";
    setLanguage(savedLang);
}
