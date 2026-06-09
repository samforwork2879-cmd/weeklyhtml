// 資料結構：{ id, title, content, tags, updatedAt }
const STORAGE_KEY = 'weekly_reports';
const THEME_KEY = 'weekly_reports_theme';

let reports = loadReports();
let currentReportId = null;
let currentTags = [];

const markedApi = window.marked;

// === 安全相容的 Markdown 解析器 ===
function parseMarkdown(text) {
    try {
        if (markedApi && typeof markedApi.parse === 'function') {
            return markedApi.parse(text);
        }
        if (typeof markedApi === 'function') {
            return markedApi(text);
        }
    } catch (e) {
        console.error("Markdown 解析出錯:", e);
    }
    return escapeHtml(text).replace(/\n/g, '<br>');
}

// DOM 元素
const reportList = document.getElementById('report-list');
const reportTitle = document.getElementById('report-title');
const tagContainer = document.getElementById('tag-container');
const tagInput = document.getElementById('tag-input');
const markdownInput = document.getElementById('markdown-input');
const htmlPreview = document.getElementById('html-preview');

const btnNew = document.getElementById('btn-new');
const btnSave = document.getElementById('btn-save');
const btnBackup = document.getElementById('btn-backup');
const btnRestore = document.getElementById('btn-restore');
const btnExportMd = document.getElementById('btn-export-md');
const btnExportHtml = document.getElementById('btn-export-html');
const backupFileInput = document.getElementById('backup-file-input');
// const btnImageFolder = document.getElementById('btn-image-folder');
const themeToggle = document.getElementById('theme-toggle');
const colorButtons = document.querySelectorAll('.color-btn');
const highlightButtons = document.querySelectorAll('.highlight-btn');
const btnClearColor = document.getElementById('btn-clear-color');
const imageFolderStatus = document.getElementById('image-folder-status');

let imageDirectoryHandle = null;

if (markedApi && typeof markedApi.setOptions === 'function') {
    markedApi.setOptions({
        gfm: true,
        breaks: true
    });
} else {
    console.error("Marked.js 載入失敗，預覽會改用純文字換行顯示。");
}

// 初始化載入
init();

function init() {
    applySavedTheme();
    renderReportList();
    if (reports.length > 0) {
        loadReport(reports[0].id);
    } else {
        createNewReport();
    }

    // 監聽輸入即時預覽
    markdownInput.addEventListener('input', () => {
        updatePreview();
    });

    // 監聽標籤輸入
    tagInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && tagInput.value.trim() !== '') {
            addTag(tagInput.value.trim());
            tagInput.value = '';
        }
    });

    reportTitle.addEventListener('input', updateCurrentDraft);
    btnBackup.addEventListener('click', exportBackupFile);
    btnRestore.addEventListener('click', () => backupFileInput.click());
    backupFileInput.addEventListener('change', handleBackupFileSelected);
    colorButtons.forEach(button => {
        button.addEventListener('click', () => wrapSelectionWithColor(button.dataset.color));
    });
    highlightButtons.forEach(button => {
        button.addEventListener('click', () => wrapSelectionWithHighlight(button.dataset.highlight));
    });
    btnClearColor.addEventListener('click', clearSelectedColor);
    // btnImageFolder.addEventListener('click', chooseImageFolder);
    markdownInput.addEventListener('paste', handleImagePaste);
    themeToggle.addEventListener('click', toggleTheme);
    updateImageFolderStatus();
}

// 渲染左側列表
function renderReportList() {
    reportList.innerHTML = '';
    reports
        .sort((a, b) => (b.title || '').localeCompare((a.title || ''), 'zh-TW', { numeric: true, sensitivity: 'base' }))
        .forEach(report => {
        const li = document.createElement('li');
        li.className = report.id === currentReportId ? 'active' : '';

        const title = document.createElement('span');
        title.textContent = report.title || '未命名週報';

        const deleteButton = document.createElement('button');
        deleteButton.className = 'delete-btn';
        deleteButton.dataset.id = report.id;
        deleteButton.title = '刪除週報';
        deleteButton.innerHTML = '<i class="fa-solid fa-trash"></i>';

        li.append(title, deleteButton);
        li.addEventListener('click', (e) => {
            if (!e.target.closest('.delete-btn')) {
                loadReport(report.id);
            }
        });
        reportList.appendChild(li);
    });

    // 綁定刪除按鈕事件
    document.querySelectorAll('.delete-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            deleteReport(btn.dataset.id);
        });
    });
}

// 新增週報
function createNewReport() {
    const newReport = {
        id: 'rep_' + Date.now(),
        title: new Date().toLocaleDateString(),
        content: '|**負責人員**|**項目**|**重要工作 / 說明**|**本週進度 / 問題點**|\n|-|-|-|-|\n|||||',
        tags: [],
        updatedAt: Date.now()
    };
    reports.push(newReport);
    saveToLocalStorage();
    currentReportId = newReport.id;
    renderReportList();
    loadReport(newReport.id);
}

// 載入指定週報
function loadReport(id) {
    currentReportId = id;
    const report = reports.find(r => r.id === id);
    if (!report) return;

    reportTitle.value = report.title || '';
    markdownInput.value = report.content || '';
    currentTags = Array.isArray(report.tags) ? [...report.tags] : [];
    
    renderTags();
    updatePreview();
    
    // 更新左側 active 狀態
    document.querySelectorAll('#report-list li').forEach(li => li.classList.remove('active'));
    renderReportList();
}

// 儲存週報
function saveReport() {
    const report = reports.find(r => r.id === currentReportId);
    if (report) {
        report.title = reportTitle.value;
        report.content = markdownInput.value;
        report.tags = currentTags;
        report.updatedAt = Date.now();
        saveToLocalStorage();
        renderReportList();
        alert('儲存成功！');
    }
}

function exportBackupFile() {
    const backup = buildBackupPayload();
    downloadFile(JSON.stringify(backup, null, 2), 'weekly_reports_backup.json', 'application/json');
}

async function handleBackupFileSelected(event) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;

    try {
        const text = await file.text();
        const backup = JSON.parse(text);
        restoreFromBackup(backup);
        alert('還原完成！');
    } catch (error) {
        console.error('還原備份失敗。', error);
        alert('還原失敗：請確認這是正確的 weekly_reports_backup.json 檔案。');
    }
}

function buildBackupPayload() {
    return {
        schemaVersion: 1,
        exportedAt: new Date().toISOString(),
        reports,
        theme: localStorage.getItem(THEME_KEY) || document.documentElement.dataset.theme || 'light',
        currentReportId
    };
}

function restoreFromBackup(backup) {
    const restoredReports = Array.isArray(backup?.reports) ? backup.reports : null;
    if (!restoredReports) {
        throw new Error('備份檔缺少 reports 陣列');
    }

    reports = restoredReports;

    const restoredTheme = backup.theme === 'dark' ? 'dark' : 'light';
    localStorage.setItem(THEME_KEY, restoredTheme);
    document.documentElement.dataset.theme = restoredTheme;
    updateThemeIcon(restoredTheme);

    const restoredCurrentId = reports.some(report => report.id === backup.currentReportId)
        ? backup.currentReportId
        : reports[0]?.id || null;

    currentReportId = restoredCurrentId;
    saveToLocalStorage();
    renderReportList();

    if (currentReportId) {
        loadReport(currentReportId);
    } else {
        createNewReport();
    }
}

function deleteReport(id) {
    if (confirm('確定要刪除此週報嗎？')) {
        reports = reports.filter(r => r.id !== id);
        saveToLocalStorage();
        if (currentReportId === id) {
            currentReportId = reports.length > 0 ? reports[0].id : null;
        }
        if (!currentReportId) {
            createNewReport();
        } else {
            renderReportList();
            loadReport(currentReportId);
        }
    }
}

// 標籤管理
function renderTags() {
    tagContainer.innerHTML = '';
    currentTags.forEach((tag, index) => {
        const tagEl = document.createElement('span');
        tagEl.className = 'tag';
        tagEl.append(document.createTextNode(tag));

        const removeButton = document.createElement('button');
        removeButton.type = 'button';
        removeButton.className = 'tag-remove';
        removeButton.title = '移除標籤';
        removeButton.innerHTML = '<i class="fa-solid fa-xmark"></i>';
        removeButton.addEventListener('click', () => removeTag(index));

        tagEl.appendChild(removeButton);
        tagContainer.appendChild(tagEl);
    });
}

function addTag(tag) {
    if (!currentTags.includes(tag) && tag.length <= 24) {
        currentTags.push(tag);
        renderTags();
        updateCurrentDraft();
    }
}

function removeTag(index) {
    currentTags.splice(index, 1);
    renderTags();
    updateCurrentDraft();
}

function loadReports() {
    try {
        const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
        return Array.isArray(saved) ? saved : [];
    } catch (e) {
        console.error('週報資料讀取失敗，已改用空資料。', e);
        return [];
    }
}

function saveToLocalStorage() {
    try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(reports));
    } catch (e) {
        console.error('週報儲存失敗。', e);
        alert('儲存失敗：資料量可能太大。若貼上了大型圖片，請先壓縮圖片後再貼上。');
    }
}

function updatePreview() {
    htmlPreview.innerHTML = parseMarkdown(markdownInput.value);
}

function updateCurrentDraft() {
    const report = reports.find(r => r.id === currentReportId);
    if (!report) return;
    report.title = reportTitle.value;
    report.content = markdownInput.value;
    report.tags = [...currentTags];
}

function wrapSelectionWithColor(color) {
    const start = markdownInput.selectionStart;
    const end = markdownInput.selectionEnd;
    const selectedText = markdownInput.value.slice(start, end) || '彩色文字';
    const coloredText = `<span style="color: ${color};">${selectedText}</span>`;

    markdownInput.setRangeText(coloredText, start, end, 'select');
    markdownInput.focus();
    updatePreview();
    updateCurrentDraft();
}

function wrapSelectionWithHighlight(type) {
    const start = markdownInput.selectionStart;
    const end = markdownInput.selectionEnd;
    const selectedText = markdownInput.value.slice(start, end) || '螢光標記';
    const highlightedText = `<mark class="mark-${type}">${selectedText}</mark>`;

    markdownInput.setRangeText(highlightedText, start, end, 'select');
    markdownInput.focus();
    updatePreview();
    updateCurrentDraft();
}

function clearSelectedColor() {
    const start = markdownInput.selectionStart;
    const end = markdownInput.selectionEnd;
    const selectedText = markdownInput.value.slice(start, end);

    if (!selectedText) {
        markdownInput.focus();
        return;
    }

    const cleanedText = selectedText
        .replace(/<span\s+style=["'][^"']*color\s*:\s*[^;"']+;?[^"']*["']>(.*?)<\/span>/gis, '$1')
        .replace(/<font\s+color=["'][^"']+["']>(.*?)<\/font>/gis, '$1')
        .replace(/<mark\s+class=["']mark-[^"']+["']>(.*?)<\/mark>/gis, '$1')
        .replace(/<mark>(.*?)<\/mark>/gis, '$1');

    markdownInput.setRangeText(cleanedText, start, end, 'select');
    markdownInput.focus();
    updatePreview();
    updateCurrentDraft();
}

async function handleImagePaste(event) {
    const files = Array.from(event.clipboardData?.files || [])
        .filter(file => file.type.startsWith('image/'));

    if (files.length === 0) return;

    event.preventDefault();

    const imageMarkdownList = [];
    for (const file of files) {
        const extension = file.type.split('/')[1] || 'png';
        const imageName = createImageFileName(file.name, extension);

        if (imageDirectoryHandle) {
            try {
                await saveImageFile(imageName, file);
                imageMarkdownList.push(`![${escapeMarkdownAlt(imageName)}](images/${imageName})`);
                continue;
            } catch (e) {
                console.error('圖片寫入資料夾失敗，改用 base64。', e);
                alert('圖片寫入 images 資料夾失敗，這張圖片會暫時改用 base64 貼上。');
            }
        }

        const dataUrl = await readFileAsDataUrl(file);
        imageMarkdownList.push(`![${escapeMarkdownAlt(imageName)}](${dataUrl})`);
    }

    insertAtCursor(`\n${imageMarkdownList.join('\n\n')}\n`);
}

async function chooseImageFolder() {
    if (!window.showDirectoryPicker) {
        alert('目前瀏覽器不支援直接寫入資料夾。請使用最新版 Chrome 或 Edge 開啟此頁。');
        return;
    }

    try {
        imageDirectoryHandle = await window.showDirectoryPicker({
            id: 'weekly-report-images',
            mode: 'readwrite'
        });
        updateImageFolderStatus();
    } catch (e) {
        if (e.name !== 'AbortError') {
            console.error('選擇圖片資料夾失敗。', e);
            alert('選擇圖片資料夾失敗，請確認瀏覽器允許檔案系統權限。');
        }
    }
}

function updateImageFolderStatus() {
    if (!imageFolderStatus) return;
    if (imageDirectoryHandle) {
        imageFolderStatus.textContent = `圖片：${imageDirectoryHandle.name}`;
        imageFolderStatus.classList.add('ready');
        return;
    }

    imageFolderStatus.textContent = '圖片：base64';
    imageFolderStatus.classList.remove('ready');
}

async function saveImageFile(fileName, file) {
    const permission = await imageDirectoryHandle.requestPermission({ mode: 'readwrite' });
    if (permission !== 'granted') {
        throw new Error('未取得圖片資料夾寫入權限');
    }

    const fileHandle = await imageDirectoryHandle.getFileHandle(fileName, { create: true });
    const writable = await fileHandle.createWritable();
    await writable.write(file);
    await writable.close();
}

function createImageFileName(originalName, extension) {
    const baseName = (originalName || 'pasted-image')
        .replace(/\.[^.]+$/, '')
        .replace(/[\\/:*?"<>|]/g, '_')
        .replace(/\s+/g, '-')
        .replace(/[^a-zA-Z0-9._-]/g, '')
        .slice(0, 40) || 'pasted-image';
    const timestamp = new Date().toISOString()
        .replace(/[-:]/g, '')
        .replace(/\..+$/, '')
        .replace('T', '-');
    return `${baseName}-${timestamp}.${extension}`;
}

function readFileAsDataUrl(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = reject;
        reader.readAsDataURL(file);
    });
}

function insertAtCursor(text) {
    const start = markdownInput.selectionStart;
    const end = markdownInput.selectionEnd;
    markdownInput.setRangeText(text, start, end, 'end');
    markdownInput.focus();
    updatePreview();
    updateCurrentDraft();
}

function applySavedTheme() {
    const savedTheme = localStorage.getItem(THEME_KEY);
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    const theme = savedTheme || (prefersDark ? 'dark' : 'light');
    document.documentElement.dataset.theme = theme;
    updateThemeIcon(theme);
}

function toggleTheme() {
    const nextTheme = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
    document.documentElement.dataset.theme = nextTheme;
    localStorage.setItem(THEME_KEY, nextTheme);
    updateThemeIcon(nextTheme);
}

function updateThemeIcon(theme) {
    const icon = themeToggle.querySelector('i');
    icon.className = theme === 'dark' ? 'fa-solid fa-sun' : 'fa-solid fa-moon';
}

function sanitizeFileName(name) {
    return (name || '未命名週報')
        .replace(/[\\/:*?"<>|]/g, '_')
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, 80) || '未命名週報';
}

function escapeHtml(value) {
    return String(value)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

function escapeMarkdownAlt(value) {
    return String(value).replace(/[\[\]\\]/g, '');
}

function getExportThemeCss(theme) {
    const isDark = theme === 'dark';
    const bgColor = isDark ? '#0f172a' : '#f5f7fb';
    const sidebarBg = isDark ? '#1e293b' : '#ffffff';
    const cardBg = isDark ? '#1e293b' : '#ffffff';
    const primaryColor = isDark ? '#3b82f6' : '#4a6cf7';
    const successColor = isDark ? '#16a34a' : '#22c55e';
    const textColor = isDark ? '#f1f5f9' : '#334155';
    const textLight = isDark ? '#94a3b8' : '#64748b';
    const borderColor = isDark ? '#334155' : '#e2e8f0';
    const listHover = isDark ? '#334155' : '#edf2ff';
    const tableHeaderBg = isDark ? '#334155' : '#f8fafc';
    const tableStripe = isDark ? '#1e293b' : '#f8fafc';

    return `
        :root {
            --app-font: 'LXGW WenKai Mono TC', 'Segoe UI', system-ui, monospace;
            --bg-color: ${bgColor};
            --sidebar-bg: ${sidebarBg};
            --card-bg: ${cardBg};
            --primary-color: ${primaryColor};
            --success-color: ${successColor};
            --text-color: ${textColor};
            --text-light: ${textLight};
            --border-color: ${borderColor};
            --list-hover: ${listHover};
            --table-header-bg: ${tableHeaderBg};
            --table-stripe: ${tableStripe};
        }
        body {
            font-family: var(--app-font);
            line-height: 1.7;
            max-width: 900px;
            margin: 40px auto;
            padding: 0 20px 32px;
            color: var(--text-color);
            background: var(--bg-color);
        }
        h1 {
            border-bottom: 2px solid var(--border-color);
            padding-bottom: 10px;
            margin-bottom: 16px;
        }
        h2, h3 {
            margin: 18px 0 10px;
        }
        p {
            margin: 0 0 12px;
        }
        ul, ol {
            padding-left: 24px;
            margin: 0 0 14px;
        }
        code {
            background: var(--bg-color);
            padding: 2px 5px;
            border-radius: 4px;
            font-family: var(--app-font);
            font-size: 0.92em;
        }
        pre {
            background: var(--card-bg);
            border: 1px solid var(--border-color);
            border-radius: 8px;
            padding: 14px;
            overflow: auto;
        }
        pre code {
            background: transparent;
            padding: 0;
        }
        table {
            width: 100%;
            border-collapse: collapse;
            margin: 20px 0;
            font-size: 0.95rem;
            border-radius: 6px;
            overflow: hidden;
        }
        th {
            background: var(--table-header-bg);
            text-align: left;
            padding: 12px 15px;
            border-bottom: 2px solid var(--border-color);
        }
        td {
            padding: 12px 15px;
            border-bottom: 1px solid var(--border-color);
        }
        tr:nth-child(even) {
            background: var(--table-stripe);
        }
        tr:hover {
            background: var(--list-hover);
        }
        img {
            display: block;
            max-width: 100%;
            height: auto;
            margin: 12px 0;
            border-radius: 6px;
            border: 1px solid var(--border-color);
        }
        mark.mark-yellow {
            background: linear-gradient(transparent 38%, rgba(254, 240, 138, 0.95) 38%);
            padding: 0 2px;
        }
        mark.mark-green {
            background: linear-gradient(transparent 38%, rgba(187, 247, 208, 0.95) 38%);
            padding: 0 2px;
        }
        mark.mark-pink {
            background: linear-gradient(transparent 38%, rgba(251, 207, 232, 0.95) 38%);
            padding: 0 2px;
        }
        .meta {
            color: var(--text-light);
            font-size: 0.9rem;
            margin-bottom: 20px;
        }
        .tag {
            background: #e0e7ff;
            color: #4338ca;
            padding: 3px 8px;
            border-radius: 12px;
            margin-right: 5px;
            font-size: 0.8rem;
            display: inline-block;
        }
    `;
}

// 按鈕事件綁定
btnNew.addEventListener('click', createNewReport);
btnSave.addEventListener('click', saveReport);

// 4. 匯出功能實作
function downloadFile(content, fileName, contentType) {
    const a = document.createElement("a");
    const file = new Blob([content], { type: contentType });
    a.href = URL.createObjectURL(file);
    a.download = fileName;
    a.click();
    URL.revokeObjectURL(a.href);
}

// 匯出為 .md 檔案
btnExportMd.addEventListener('click', () => {
    const report = reports.find(r => r.id === currentReportId);
    if (!report) return;
    
    updateCurrentDraft();
    let mdMeta = `---\ntitle: ${reportTitle.value}\ntags: ${currentTags.join(', ')}\ndate: ${new Date(report.updatedAt).toLocaleDateString()}\n---\n\n`;
    const fullContent = mdMeta + markdownInput.value;
    
    downloadFile(fullContent, `${sanitizeFileName(reportTitle.value)}.md`, 'text/markdown');
});

// 匯出為獨立的 .html 檔案 (包含基礎美化樣式)
btnExportHtml.addEventListener('click', () => {
    const report = reports.find(r => r.id === currentReportId);
    if (!report) return;
    updateCurrentDraft();
    const theme = document.documentElement.dataset.theme || 'light';

    const htmlContent = `
<!DOCTYPE html>
<html lang="zh-TW">
<head>
    <meta charset="UTF-8">
    <title>${escapeHtml(reportTitle.value)}</title>
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link href="https://fonts.googleapis.com/css2?family=LXGW+WenKai+Mono+TC&display=swap" rel="stylesheet">
    <style>
${getExportThemeCss(theme)}
    </style>
</head>
<body>
    <h1>${escapeHtml(reportTitle.value)}</h1>
    <div class="meta">
        更新時間: ${new Date(report.updatedAt).toLocaleString()} <br>
        標籤: ${currentTags.map(t => `<span class="tag">${escapeHtml(t)}</span>`).join('')}
    </div>
    <hr>
    <div class="content">
        ${parseMarkdown(markdownInput.value)}
    </div>
</body>
</html>
    `;
    
    downloadFile(htmlContent, `${sanitizeFileName(reportTitle.value)}.html`, 'text/html');
});
