// ==UserScript==
// @name         CSRT - CCW Security Research Tool
// @namespace    https://www.ccw.site/
// @version      2.6.0
// @description  CCW的一个安全研究工具 拥有-完整扩展拦截 | 代码修改 | 附加功能 | 经济合约 | 伪装手机号 | 伪装身份 | 修改作品数据 | 无视黑名单 等非常多的工具 初次使用悬浮球时会有点卡顿 请谅解
// @author       110200
// @match        https://www.ccw.site/*
// @grant        GM_xmlhttpRequest
// @grant        unsafeWindow
// @grant        GM_setValue
// @grant        GM_getValue
// @grant        GM_deleteValue
// @grant        GM_registerMenuCommand
// @run-at       document-start
// ==/UserScript==

(function() {
    'use strict';

    // ==================== 配置 ====================
    const SCRIPT_VERSION = '2.6.0';
    const SCRIPT_NAME = 'CSRT - CCW Security Research Tool';

    // 禁用所有控制台输出
    const originalConsole = {
        log: console.log,
        warn: console.warn,
        error: console.error,
        info: console.info,
        debug: console.debug,
        trace: console.trace,
        dir: console.dir,
        table: console.table,
        group: console.group,
        groupEnd: console.groupEnd,
        groupCollapsed: console.groupCollapsed,
        time: console.time,
        timeLog: console.timeLog,
        timeEnd: console.timeEnd,
        assert: console.assert,
        count: console.count,
        countReset: console.countReset,
        clear: console.clear
    };

    console.log = () => {};
    console.warn = () => {};
    console.error = () => {};
    console.info = () => {};
    console.debug = () => {};
    console.trace = () => {};
    console.dir = () => {};
    console.table = () => {};
    console.group = () => {};
    console.groupEnd = () => {};
    console.groupCollapsed = () => {};
    console.time = () => {};
    console.timeLog = () => {};
    console.timeEnd = () => {};
    console.assert = () => {};
    console.count = () => {};
    console.countReset = () => {};
    console.clear = () => {};

    // 私有日志系统
    const privateLog = {
        errors: [],
        warnings: [],
        logs: [],
        addError: function(msg) { this.errors.push({time: Date.now(), msg}); },
        addWarning: function(msg) { this.warnings.push({time: Date.now(), msg}); },
        addLog: function(msg) { this.logs.push({time: Date.now(), msg}); },
        getErrors: function() { return this.errors; },
        clear: function() { this.errors = []; this.warnings = []; this.logs = []; }
    };

    // ==================== 功能开关 ====================

    const featureSettings = {
        bypassBlacklist: false,
        blockCollaboration: false,
        projectReplacer: false,
        spriteInserter: false,
        fakeIdentity: false,
        performanceMonitor: false,
        fakePhone: false,
        economyContract: false
    };

    // 伪装手机号配置
    const phoneSettings = {
        identityAuthRank: 'L2',  // L0, L1, L2
        phoneNumber: '12345678901',
        reputationRank: 'EXCELLENT',
        reputationScore: 100,
        fullName: '不想上学'
    };

    function loadSettings() {
        try {
            const saved = localStorage.getItem('__csrt_features');
            if (saved) {
                const parsed = JSON.parse(saved);
                Object.assign(featureSettings, parsed);
            }
            const phoneSaved = localStorage.getItem('__csrt_phone_settings');
            if (phoneSaved) {
                const parsed = JSON.parse(phoneSaved);
                Object.assign(phoneSettings, parsed);
            }
        } catch (e) {}
    }

    function saveSettings() {
        try {
            localStorage.setItem('__csrt_features', JSON.stringify(featureSettings));
            localStorage.setItem('__csrt_phone_settings', JSON.stringify(phoneSettings));
        } catch (e) {}
    }

    loadSettings();

    // ==================== 页面类型判断 ====================

    function getPageType() {
        const url = window.location.href;
        if (url.match(/\/student\/[^?\/]+/)) {
            return 'profile';
        }
        if (url.match(/\/creation\/[^?\/]+/) || url.match(/\/detail\/[^?\/]+/)) {
            return 'project';
        }
        if (url.match(/\/gandi/)) {
            return 'gandi';
        }
        return 'other';
    }

    function extractUserIdFromUrl(url) {
        const match = url.match(/\/student\/([^?\/]+)/);
        if (match) return match[1];
        return null;
    }

    // ==================== VM 捕获机制 ====================

    let vmInstance = null;
    let vmPromiseResolve = null;
    let trapViaBindReject = null;
    const vmPromise = new Promise((resolve, reject) => {
        vmPromiseResolve = resolve;
        trapViaBindReject = reject;
    });

    function trapVM() {
        const originalBind = Function.prototype.bind;
        Function.prototype.bind = function(self, ...args) {
            if (typeof self === 'object' && self !== null &&
                Object.prototype.hasOwnProperty.call(self, 'editingTarget') &&
                Object.prototype.hasOwnProperty.call(self, 'runtime')) {
                Function.prototype.bind = originalBind;
                vmInstance = self;
                if (vmPromiseResolve) {
                    vmPromiseResolve(self);
                    vmPromiseResolve = null;
                }
                return originalBind.call(this, self, ...args);
            }
            return originalBind.call(this, self, ...args);
        };
    }

    trapVM();

    setTimeout(() => {
        if (trapViaBindReject) {
            trapViaBindReject(new Error('获取VM超时'));
            trapViaBindReject = null;
        }
    }, 15000);

    // ==================== 获取VM的多种方式 ====================

    function getReduxStoreFromDOM() {
        try {
            if (window.__REACT_DEVTOOLS_GLOBAL_HOOK__) {
                const roots = window.__REACT_DEVTOOLS_GLOBAL_HOOK__.getFiberRoots?.(1) || [];
                for (const root of roots) {
                    const result = (function findStore(node, visited = new Set()) {
                        if (!node || visited.has(node)) return null;
                        visited.add(node);
                        try {
                            if (node?.memoizedState?.state?.scratchGui?.vm) {
                                return node.memoizedState.state;
                            }
                            if (node?.stateNode?.state?.scratchGui?.vm) {
                                return node.stateNode;
                            }
                            if (node?.getState?.()?.scratchGui?.vm) {
                                return node;
                            }
                            for (const key in node) {
                                if (node[key] && typeof node[key] === 'object') {
                                    const result = findStore(node[key], visited);
                                    if (result) return result;
                                }
                            }
                        } catch (e) {}
                        return null;
                    })(root);
                    if (result) return result;
                }
            }

            for (const el of document.querySelectorAll('*')) {
                try {
                    const key = Object.keys(el).find(k => k.includes('__reactContainer'));
                    if (key && el[key]) {
                        const result = (function findStore(node, visited = new Set()) {
                            if (!node || visited.has(node)) return null;
                            visited.add(node);
                            try {
                                if (node.getState) {
                                    const state = node.getState();
                                    if (state?.scratchGui?.vm && state.scratchPaint) {
                                        return node;
                                    }
                                }
                                for (const key in node) {
                                    if (node[key] && typeof node[key] === 'object') {
                                        const result = findStore(node[key], visited);
                                        if (result) return result;
                                    }
                                }
                            } catch (e) {}
                            return null;
                        })(el[key]);
                        if (result) return result;
                    }
                } catch (e) {}
            }
        } catch (e) {
            privateLog.addError('获取Redux Store失败: ' + e.message);
        }
        return null;
    }

    async function getVM() {
        let vm = window.eureka?.vm;
        if (vm) {
            privateLog.addLog('通过Eureka获取vm');
            return vm;
        }

        vm = window.vm ?? unsafeWindow.vm;
        if (vm) {
            privateLog.addLog('通过全局变量获取vm');
            return vm;
        }

        if (document.readyState === 'complete') {
            const store = getReduxStoreFromDOM();
            if (store) {
                vm = store.getState?.()?.scratchGui?.vm;
                if (vm) {
                    privateLog.addLog('通过DOM获取vm');
                    return vm;
                }
            }
        }

        vm = await vmPromise;
        privateLog.addLog('通过Bind获取vm');
        return vm;
    }

    // ==================== 工具函数 ====================

    function patch(obj, p, fn) {
        if (obj[p]) obj[p] = fn(obj[p]);
    }

    function getCookie(name) {
        const value = `; ${document.cookie}`;
        const parts = value.split(`; ${name}=`);
        if (parts.length === 2) return parts.pop().split(";").shift();
    }

    function setCookie(name, value) {
        document.cookie = `${name}=${value}; path=/; domain=.ccw.site;`;
    }

    function extractProjectIdFromUrl(url) {
        let match = url.match(/\/detail\/([^?\/]+)/);
        if (match) return match[1];
        match = url.match(/\/creation\/([^?\/]+)/);
        if (match) return match[1];
        match = url.match(/\/project\/([^?\/]+)/);
        if (match) return match[1];
        match = url.match(/\/([^?\/]+)(?:\?|$)/);
        if (match && match[1].length >= 8) return match[1];
        return null;
    }

    let cachedCreator = null;
    let cachedUsername = null;

    function extractCreatorInfo() {
        const title = document.title;
        const titleMatch = title.match(/^(.+?)\s*-\s*(.+?)\s*-\s*共创世界/);
        if (titleMatch) {
            return titleMatch[2].trim();
        }

        const creatorSelectors = [
            '.creator-info .name',
            '.author-info .name',
            '.user-info .username',
            '[class*="creator"] [class*="name"]',
            '.detail-creator .name',
            '.project-creator .name'
        ];

        for (const selector of creatorSelectors) {
            try {
                const el = document.querySelector(selector);
                if (el && el.textContent.trim() && !el.textContent.includes('创作者中心')) {
                    return el.textContent.trim();
                }
            } catch (e) {}
        }

        try {
            const scripts = document.querySelectorAll('script[type="application/json"]');
            for (const script of scripts) {
                try {
                    const data = JSON.parse(script.textContent);
                    if (data?.body?.creator?.name) return data.body.creator.name;
                    if (data?.body?.user?.name) return data.body.user.name;
                    if (data?.creator?.name) return data.creator.name;
                    if (data?.user?.name) return data.user.name;
                } catch (e) {}
            }
        } catch (e) {}

        return '未知创作者';
    }

    function extractUsernameFromTitle() {
        const title = document.title;
        const match = title.match(/^(.+?)的主页\s*-\s*共创世界/);
        if (match) {
            return match[1].trim();
        }
        return null;
    }

    function blobToArrayBuffer(blob) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onloadend = () => resolve(reader.result);
            reader.onerror = reject;
            reader.readAsArrayBuffer(blob);
        });
    }

    function randomString(length, chars) {
        let result = '';
        for (let i = 0; i < length; i++) {
            result += chars[Math.floor(Math.random() * chars.length)];
        }
        return result;
    }

    // ==================== 文件选择对话框 ====================

    function showFilePrompt(accept = '', label = '') {
        return new Promise((resolve) => {
            const overlay = document.createElement('div');
            overlay.style.cssText = `
                position: fixed;
                top: 0;
                left: 0;
                width: 100%;
                height: 100%;
                background: rgba(0, 0, 0, 0.6);
                display: flex;
                align-items: center;
                justify-content: center;
                z-index: 9999;
                backdrop-filter: blur(4px);
            `;

            const dropArea = document.createElement('div');
            dropArea.style.cssText = `
                background: #1a1a2e;
                padding: 32px 40px;
                border-radius: 16px;
                border: 3px dashed #6272a4;
                cursor: pointer;
                font-size: 16px;
                text-align: center;
                min-width: 320px;
                max-width: 90vw;
                color: #f8f8f2;
                transition: border-color 0.3s;
                box-shadow: 0 20px 60px rgba(0,0,0,0.8);
            `;
            dropArea.innerHTML = `
                <div style="font-size: 24px; font-weight: bold; margin-bottom: 12px; color: #8be9fd;">
                    📂 选择或拖入文件
                </div>
                <div style="color: #6272a4; font-size: 14px;">
                    ${label || '上传文件'}
                </div>
                <div style="color: #6272a4; font-size: 12px; margin-top: 8px;">
                    支持格式: ${accept || '所有文件'}
                </div>
            `;

            const fileInput = document.createElement('input');
            fileInput.type = 'file';
            fileInput.accept = accept;
            fileInput.style.display = 'none';

            const cleanup = () => {
                if (overlay.parentNode) overlay.remove();
                document.removeEventListener('keydown', keyHandler);
            };

            const keyHandler = (e) => {
                if (e.key === 'Escape') {
                    cleanup();
                    resolve(null);
                }
            };

            overlay.addEventListener('click', (e) => {
                if (e.target === overlay) {
                    cleanup();
                    resolve(null);
                }
            });

            dropArea.addEventListener('click', () => fileInput.click());

            dropArea.addEventListener('dragover', (e) => {
                if (e.dataTransfer.types.includes('Files')) {
                    e.preventDefault();
                    e.dataTransfer.dropEffect = 'copy';
                    dropArea.style.borderColor = '#8be9fd';
                }
            });

            dropArea.addEventListener('dragleave', () => {
                dropArea.style.borderColor = '#6272a4';
            });

            dropArea.addEventListener('drop', (e) => {
                const file = e.dataTransfer.files[0];
                if (file) {
                    e.preventDefault();
                    cleanup();
                    resolve(file);
                }
            });

            fileInput.addEventListener('change', (e) => {
                const file = e.target.files[0];
                if (file) {
                    cleanup();
                    resolve(file);
                }
            });

            document.addEventListener('keydown', keyHandler);

            overlay.appendChild(dropArea);
            overlay.appendChild(fileInput);
            document.body.appendChild(overlay);
        });
    }

    // ==================== 无视黑名单功能 ====================

    function setupBypassBlacklist() {
        if (!featureSettings.bypassBlacklist) return;

        const XHR = XMLHttpRequest.prototype;
        const originalOpen = XHR.open;

        XHR.open = function(method, url) {
            if (url === "https://community-web.ccw.site/student/block_record/status") {
                return originalOpen.call(
                    this,
                    method,
                    'data:application/json,{"body":"NOT_BLOCKED","code":"200","msg":null,"status":200}'
                );
            }
            return originalOpen.call(this, method, url);
        };
    }

    // ==================== 屏蔽协作记录功能 ====================

    function setupBlockCollaboration() {
        if (!featureSettings.blockCollaboration) return;

        function tryParse(text) {
            try {
                return JSON.parse(text);
            } catch {
                return;
            }
        }

        function patchData(data) {
            if (data && data[0] === "project") {
                data[1].author = "61039f14fffbe5461b880787";
                return data;
            } else if (data && data[0] === "log") {
                return [];
            }
            return data;
        }

        const WS = WebSocket.prototype;
        const originalSend = WS.send;

        WS.send = function(data) {
            if (this.url && this.url.startsWith("wss://mp2.ccw.site/multiplayer/")) {
                const json = tryParse(data);
                if (json) {
                    const patched = patchData(json);
                    if (patched !== undefined && patched !== null) {
                        data = JSON.stringify(patched);
                    }
                    if (Array.isArray(patched) && patched.length === 0) {
                        return;
                    }
                }
            }
            return originalSend.apply(this, arguments);
        };
    }

    // ==================== 作品替换器功能 ====================

    function setupProjectReplacer() {
        if (!featureSettings.projectReplacer) return;

        const REPLACER_KEY = 'csrt_project_replacer';

        let storedBlob = null;
        try {
            const meta = GM_getValue(REPLACER_KEY + '_meta');
            if (meta) {
                let dataStr = '';
                for (let i = 0; i < meta.totalChunks; i++) {
                    dataStr += GM_getValue(REPLACER_KEY + '_chunk_' + i, '');
                }
                const binary = atob(dataStr);
                const chunks = [];
                for (let i = 0; i < binary.length; i += 512) {
                    const slice = binary.slice(i, i + 512);
                    const arr = new Array(slice.length);
                    for (let j = 0; j < slice.length; j++) {
                        arr[j] = slice.charCodeAt(j);
                    }
                    chunks.push(new Uint8Array(arr));
                }
                storedBlob = new Blob(chunks, { type: meta.type });
            }
        } catch (e) {
            privateLog.addError('加载作品替换数据失败: ' + e.message);
        }

        if (!storedBlob) return;

        const XHR = XMLHttpRequest.prototype;
        const originalOpen = XHR.open;
        const originalSend = XHR.send;

        XHR.open = function(method, url) {
            this._url = url;
            this._method = method;
            return originalOpen.apply(this, arguments);
        };

        XHR.send = function(data) {
            if (this._url && this._url.includes('creation/detail')) {
                const xhr = this;
                const onReadyStateChange = xhr.onreadystatechange;

                xhr.onreadystatechange = function() {
                    if (this.readyState === 4) {
                        try {
                            const response = JSON.parse(this.responseText);
                            const blobUrl = URL.createObjectURL(storedBlob);

                            response.body.latestProjectLink = blobUrl;
                            if (response.body.creationRelease) {
                                response.body.creationRelease.projectLink = blobUrl;
                            }
                            response.body.requireLogin = false;
                            response.body.forEveryone = true;
                            response.body.status = 'PUBLISHED';
                            response.body.isOpenSource = true;
                            response.body.sourceOpenLevel = 'PUBLIC';

                            if (response.body.creationReleaseList) {
                                const now = Date.now();
                                response.body.creationReleaseList.unshift({
                                    checked: false,
                                    coverGifLink: null,
                                    coverLink: response.body.latestCoverLink || null,
                                    createdAt: now,
                                    customVersion: '已替换 (CSRT)',
                                    description: null,
                                    extensions: [],
                                    hasCloudVariables: false,
                                    keyboardLayout: 'TOUCH',
                                    oid: response.body.oid || 'unknown',
                                    operatingInstruction: null,
                                    profiling: null,
                                    projectLink: blobUrl,
                                    status: 'PUBLISHED',
                                    submittedAt: now,
                                    tags: [],
                                    updatedAt: now,
                                    version: '已替换',
                                    videoLink: null
                                });
                            }

                            const jsonStr = JSON.stringify(response);
                            Object.defineProperty(this, 'responseText', {
                                get: () => jsonStr,
                                configurable: true
                            });
                            Object.defineProperty(this, 'response', {
                                get: () => jsonStr,
                                configurable: true
                            });

                            privateLog.addLog('作品已替换: ' + blobUrl);
                        } catch (e) {
                            privateLog.addError('作品替换失败: ' + e.message);
                        }
                    }

                    if (onReadyStateChange) {
                        return onReadyStateChange.apply(this, arguments);
                    }
                };
            }

            return originalSend.apply(this, arguments);
        };
    }

    // ==================== 伪装身份功能 ====================

    function setupFakeIdentity() {
        if (!featureSettings.fakeIdentity) return;

        const identity = GM_getValue('csrt_fake_identity');
        if (!identity) return;

        const { oid, id, name, avatar } = identity;

        const XHR = XMLHttpRequest.prototype;
        const originalOpen = XHR.open;

        XHR.open = function(method, url) {
            if (url === "https://community-web.ccw.site/students/self/detail") {
                const fakeData = {
                    body: {
                        abGroup: null,
                        accountNumber: null,
                        address: null,
                        addressCode: null,
                        age: null,
                        archive: null,
                        avatar: avatar || 'https://m.ccw.site/community/images/logo-ccw.png',
                        bio: "",
                        birthYear: null,
                        birthday: null,
                        category: null,
                        city: null,
                        commentCount: 0,
                        contactPhone: "12345678901",
                        countryCode: null,
                        createdAt: Date.now(),
                        currentMajorClazzOid: null,
                        currentParent: {
                            bindPhone: "12345678901",
                            qqNickname: "CSRT",
                            qqNum: null
                        },
                        distinctId: null,
                        district: null,
                        email: null,
                        energy: null,
                        energyRegain: null,
                        examScore: null,
                        extraInfo: null,
                        firstTime: null,
                        followingStatus: null,
                        fullName: name || "创作者",
                        gender: null,
                        grade: 0,
                        group: null,
                        guest: null,
                        guestNumber: null,
                        hideGender: false,
                        host: "aliyun",
                        identity: null,
                        identityAuthRank: "L2",
                        identityType: null,
                        informationModifyDate: {
                            avatarModifiedAt: null,
                            nameModifiedAt: null
                        },
                        keywords: [],
                        lastLoginAt: null,
                        lastStudyAt: null,
                        lowAge: null,
                        midexamScore: null,
                        miniprojectFreeNum: null,
                        mpClicked: null,
                        mpShowedModal: null,
                        mpTutorial: null,
                        name: name || "创作者",
                        oid: oid || 'unknown',
                        orgId: null,
                        parents: [],
                        passwordDigest: null,
                        photo: null,
                        picUrl: null,
                        province: null,
                        qq: null,
                        receiver: null,
                        regChannel: "1",
                        remarkName: null,
                        reputationScore: {
                            rank: "EXCELLENT",
                            score: 100,
                            studentOid: null
                        },
                        role: null,
                        school: null,
                        showServiceTerm: null,
                        showTaskList: null,
                        stats: null,
                        studentNumber: id || '00000000',
                        task: null,
                        teacherUnreadedMessages: null,
                        tutorialSteps: null,
                        updatedAt: Date.now(),
                        validateSchool: null,
                        virtualValue: null,
                        watchedMiniProjectTutorailVideo: null,
                        xiguaStudentNo: null
                    },
                    code: "200",
                    msg: null,
                    status: 200
                };

                const jsonStr = JSON.stringify(fakeData);
                return originalOpen.call(
                    this,
                    method,
                    'data:application/json,' + jsonStr
                );
            }
            return originalOpen.call(this, method, url);
        };

        if (oid && !getCookie('cookie-user-id')) {
            setCookie('cookie-user-id', oid);
        }

        privateLog.addLog('伪装身份已启用: ' + (name || id));
    }

    // ==================== 伪装手机号功能 ====================

    function setupFakePhone() {
        if (!featureSettings.fakePhone) return;

        const XHR = XMLHttpRequest.prototype;
        const originalOpen = XHR.open;

        function patchPhoneResponse(json) {
            if (!json?.body) {
                throw new Error('返回body为空');
            }

            let rank = phoneSettings.identityAuthRank;
            if (!rank) {
                const autoMap = {
                    'L0': 'L1',
                    'L1': 'L2',
                    'L2': 'L1'
                };
                rank = autoMap[json.body.identityAuthRank] || 'L1';
            }

            json.body.identityAuthRank = rank;
            json.body.contactPhone = phoneSettings.phoneNumber;
            if (json.body.currentParent) {
                json.body.currentParent.bindPhone = phoneSettings.phoneNumber;
            }
            json.body.accountNumber = phoneSettings.phoneNumber;

            if (json.body.currentParent) {
                json.body.currentParent.qqNickname = null;
                json.body.currentParent.qqNum = null;
            }

            if (rank === 'L2') {
                json.body.fullName = json.body.fullName || phoneSettings.fullName;
                json.body.identity = json.body.identity || randomString(18, '0123456789');
            }

            if (json.body.parents) {
                json.body.parents.forEach(parent => {
                    parent.distinctId = parent.distinctId || randomString(32, 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789');
                    parent.phoneAddr = phoneSettings.phoneNumber;
                    parent.telephone = phoneSettings.phoneNumber;
                });
            }

            if (json.body.reputationScore) {
                json.body.reputationScore.rank = phoneSettings.reputationRank;
                json.body.reputationScore.score = phoneSettings.reputationScore;
            }

            return json;
        }

        XHR.open = function(method, url) {
            if (url === "https://community-web.ccw.site/students/self/detail") {
                const _send = this.send;
                this.send = function(data) {
                    const _onreadystatechange = this.onreadystatechange;
                    this.onreadystatechange = function() {
                        if (this.readyState === 4) {
                            try {
                                const response = JSON.parse(this.response);
                                const patched = patchPhoneResponse(response);
                                const jsonStr = JSON.stringify(patched);
                                Object.defineProperty(this, 'responseText', {
                                    get: () => jsonStr,
                                    configurable: true
                                });
                                Object.defineProperty(this, 'response', {
                                    get: () => jsonStr,
                                    configurable: true
                                });
                                privateLog.addLog('伪装手机号已加载');
                            } catch (e) {
                                privateLog.addError('伪装手机号失败: ' + e.message);
                            }
                        }
                        if (_onreadystatechange) {
                            return _onreadystatechange.call(this);
                        }
                    };
                    return _send.call(this, data);
                };
            }
            return originalOpen.call(this, method, url);
        };
    }

    // ==================== 检测扩展 ====================

    function hasCCWDataExtension(vm) {
        if (!vm || !vm.runtime) return false;

        if (vm.extensionManager) {
            const loadedExts = vm.extensionManager._loadedExtensions || {};
            if (loadedExts['ccwdata']) {
                return true;
            }
            if (vm.extensionManager._gandiExternalExtensionServices &&
                vm.extensionManager._gandiExternalExtensionServices['ccwdata']) {
                return true;
            }
        }

        const targets = vm.runtime.targets || [];
        for (const target of targets) {
            if (target.blocks) {
                const blocks = target.blocks._blocks || {};
                for (const blockId in blocks) {
                    const block = blocks[blockId];
                    if (block.opcode && block.opcode.startsWith('ccwdata_')) {
                        return true;
                    }
                }
            }
        }

        return false;
    }

    function hasGandiEconomyExtension(vm) {
        if (!vm || !vm.runtime) return false;

        if (vm.extensionManager) {
            const loadedExts = vm.extensionManager._loadedExtensions || {};
            const extNames = Object.keys(loadedExts);
            for (const name of extNames) {
                if (name.toLowerCase().includes('gandieconomy') || name === 'gandieconomy') {
                    return true;
                }
            }

            if (vm.extensionManager._gandiExternalExtensionServices) {
                const gandiExts = Object.keys(vm.extensionManager._gandiExternalExtensionServices);
                for (const name of gandiExts) {
                    if (name.toLowerCase().includes('gandieconomy') || name === 'gandieconomy') {
                        return true;
                    }
                }
            }
        }

        const targets = vm.runtime.targets || [];
        for (const target of targets) {
            if (target.blocks) {
                const blocks = target.blocks._blocks || {};
                for (const blockId in blocks) {
                    const block = blocks[blockId];
                    if (block.opcode && block.opcode.startsWith('gandieconomy_')) {
                        return true;
                    }
                }
            }
        }

        return false;
    }

    // ==================== 注册油猴菜单 ====================

    function registerMenuCommands() {
        const identity = GM_getValue('csrt_fake_identity');
        GM_registerMenuCommand(
            identity ? `🎭 伪装身份 (${identity.name || identity.id})` : '🎭 伪装身份 (未开启)',
            async function() {
                try {
                    const oid = prompt(
                        '输入目标用户的oid（主页链接后面的部分），取消代表不伪装',
                        identity?.oid || ''
                    );

                    if (!oid) {
                        GM_deleteValue('csrt_fake_identity');
                        if (confirm('已清除伪装身份，是否刷新页面？')) {
                            location.reload();
                        }
                        return;
                    }

                    const info = await fetch('https://community-web.ccw.site/students/profile', {
                        headers: { 'content-type': 'application/json' },
                        referrer: 'https://www.ccw.site/',
                        method: 'POST',
                        body: JSON.stringify({ studentOid: oid })
                    }).then(r => r.json());

                    let id, name, avatar;

                    if (info.body?.studentNumber) {
                        id = prompt('输入要伪装的id，取消代表自动获取', identity?.id || '');
                        if (id === null) id = info.body.studentNumber;
                    } else {
                        id = prompt('输入要伪装的id', identity?.id || '');
                    }

                    if (info.body?.name) {
                        name = prompt('输入要伪装的名字，取消代表自动获取', identity?.name || '');
                        if (name === null) name = info.body.name;
                    } else {
                        name = prompt('输入要伪装的名字', identity?.name || '');
                    }

                    if (info.body?.avatar) {
                        avatar = prompt('输入要伪装的头像url，取消代表自动获取', identity?.avatar || '');
                        if (avatar === null) avatar = info.body.avatar;
                    } else {
                        avatar = prompt('输入要伪装的头像url', identity?.avatar || '');
                    }

                    if (id === null || name === null || avatar === null) return;

                    GM_setValue('csrt_fake_identity', { oid, id, name, avatar });
                    alert('✅ 伪装身份已保存，刷新页面生效！');
                    location.reload();
                } catch (e) {
                    alert('❌ 设置失败: ' + e.message);
                }
            }
        );

        const hasReplacerData = GM_getValue('csrt_project_replacer_meta') !== undefined;
        GM_registerMenuCommand(
            hasReplacerData ? '🔄 作品替换器 - 已替换' : '🔄 作品替换器 - 选择文件',
            async () => {
                if (hasReplacerData) {
                    if (confirm('已存在替换文件，是否清除？')) {
                        GM_deleteValue('csrt_project_replacer_meta');
                        const count = GM_getValue('csrt_project_replacer_chunk_count', 0);
                        for (let i = 0; i < count; i++) {
                            GM_deleteValue('csrt_project_replacer_chunk_' + i);
                        }
                        GM_deleteValue('csrt_project_replacer_chunk_count');
                        alert('✅ 已清除，刷新页面生效。');
                        location.reload();
                    }
                    return;
                }

                const file = await showFilePrompt('.sb3,.sb2,.zip', '上传sb3文件');
                if (!file) return;

                try {
                    const reader = new FileReader();
                    await new Promise((resolve, reject) => {
                        reader.onload = function(e) {
                            try {
                                const base64 = e.target.result.split(',')[1];
                                const chunkSize = 102400;
                                const chunks = [];
                                for (let i = 0; i < base64.length; i += chunkSize) {
                                    chunks.push(base64.slice(i, i + chunkSize));
                                }
                                GM_setValue('csrt_project_replacer_meta', {
                                    totalChunks: chunks.length,
                                    size: file.size,
                                    type: file.type
                                });
                                chunks.forEach((chunk, index) => {
                                    GM_setValue('csrt_project_replacer_chunk_' + index, chunk);
                                });
                                GM_setValue('csrt_project_replacer_chunk_count', chunks.length);
                                resolve();
                            } catch (e) {
                                reject(e);
                            }
                        };
                        reader.onerror = reject;
                        reader.readAsDataURL(file);
                    });
                    alert('✅ 作品替换文件已保存！刷新页面生效。');
                    location.reload();
                } catch (e) {
                    alert('❌ 保存失败: ' + e.message);
                }
            }
        );

        GM_registerMenuCommand('🧩 角色插入器 - 插入角色', async () => {
            try {
                const vm = await getVM();
                if (!vm) {
                    alert('❌ 无法获取VM实例，请确保在作品页面使用');
                    return;
                }

                const file = await showFilePrompt('.sprite3,.sprite2,.zip', '上传角色文件');
                if (!file) return;

                await vm.addSprite(await blobToArrayBuffer(file));
                alert('✅ 角色插入成功！');
            } catch (e) {
                alert('❌ 错误: ' + e.message);
            }
        });
    }

    // ==================== 获取作品信息 ====================

    async function getProjectInfo(forceRefresh = false) {
        const pageType = getPageType();

        const info = {
            pageType: pageType,
            url: window.location.href,
            title: document.title,
            projectId: null,
            userId: null,
            creator: null,
            userName: null,
            creatorId: null,
            internalExtensions: [],
            customExtensions: [],
            allExtensions: [],
            wildExtensions: {},
            projectExtensions: [],
            extensionURLs: {},
            loadedExtensions: [],
            hasMaliciousPatterns: false,
            warnings: [],
            vmInfo: null,
            projectData: null,
            isExtensionIntercepted: false,
            hasCCWData: false,
            hasGandiEconomy: false,
            isProfile: false
        };

        if (pageType === 'profile') {
            info.isProfile = true;
            info.userId = extractUserIdFromUrl(window.location.href);

            if (!forceRefresh && cachedUsername) {
                info.userName = cachedUsername;
            } else {
                const username = extractUsernameFromTitle();
                if (username) {
                    cachedUsername = username;
                    info.userName = username;
                } else {
                    info.userName = '未知用户';
                }
            }

            try {
                const nameEl = document.querySelector('.user-name, .username, .nickname, [class*="name"]');
                if (nameEl && nameEl.textContent.trim() && !nameEl.textContent.includes('创作者中心')) {
                    if (!cachedUsername) {
                        info.userName = nameEl.textContent.trim();
                        cachedUsername = info.userName;
                    }
                }
            } catch (e) {}

            return info;
        }

        if (!forceRefresh && cachedCreator) {
            info.creator = cachedCreator;
        } else {
            const creator = extractCreatorInfo();
            cachedCreator = creator;
            info.creator = creator;
        }

        info.projectId = extractProjectIdFromUrl(window.location.href);

        try {
            const creatorLink = document.querySelector('[class*="creator"] a, [class*="author"] a');
            if (creatorLink) {
                const idMatch = creatorLink.href.match(/\/student\/(\d+)/);
                if (idMatch) info.creatorId = idMatch[1];
            }

            await vmPromise;

            if (vmInstance) {
                info.vmInfo = {
                    runtime: !!vmInstance.runtime,
                    editingTarget: !!vmInstance.editingTarget,
                    targets: vmInstance.runtime?.targets?.length || 0
                };

                const runtime = vmInstance.runtime;
                if (runtime) {
                    info.hasCCWData = hasCCWDataExtension(vmInstance);
                    info.hasGandiEconomy = hasGandiEconomyExtension(vmInstance);

                    let projectData = null;
                    let loadedExts = {};

                    try {
                        projectData = runtime.getProjectData?.();
                        if (!projectData) {
                            if (vmInstance._projectData) projectData = vmInstance._projectData;
                            else if (runtime._projectData) projectData = runtime._projectData;
                            else if (vmInstance.projectData) projectData = vmInstance.projectData;
                        }

                        if (projectData) {
                            info.projectData = projectData;
                            info.projectExtensions = projectData.extensions || [];
                            if (projectData.gandi?.wildExtensions) {
                                info.wildExtensions = projectData.gandi.wildExtensions;
                            }
                            if (projectData.extensionURLs) {
                                info.extensionURLs = projectData.extensionURLs;
                            }
                        }
                    } catch (e) {
                        privateLog.addError('获取项目数据失败: ' + e.message);
                    }

                    if (vmInstance.extensionManager) {
                        const extensionManager = vmInstance.extensionManager;
                        loadedExts = extensionManager._loadedExtensions || {};
                        info.loadedExtensions = Object.keys(loadedExts);
                    }

                    const allExtsMap = new Map();

                    if (projectData?.gandi?.wildExtensions) {
                        Object.entries(projectData.gandi.wildExtensions).forEach(([name, data]) => {
                            allExtsMap.set(name, {
                                name: name,
                                url: data.url || data.assetUri || '未知',
                                source: 'gandi.wildExtensions',
                                type: 'custom',
                                isLoaded: info.loadedExtensions.includes(name)
                            });
                        });
                    }

                    if (projectData?.extensionURLs) {
                        Object.entries(projectData.extensionURLs).forEach(([name, url]) => {
                            if (!allExtsMap.has(name)) {
                                allExtsMap.set(name, {
                                    name: name,
                                    url: url,
                                    source: 'extensionURLs',
                                    type: 'custom',
                                    isLoaded: info.loadedExtensions.includes(name)
                                });
                            }
                        });
                    }

                    if (projectData?.extensions) {
                        projectData.extensions.forEach(ext => {
                            if (typeof ext === 'string') {
                                if (!allExtsMap.has(ext)) {
                                    allExtsMap.set(ext, {
                                        name: ext,
                                        url: null,
                                        source: 'projectData.extensions (string)',
                                        type: 'internal',
                                        isLoaded: info.loadedExtensions.includes(ext)
                                    });
                                }
                            } else if (typeof ext === 'object' && ext.url) {
                                const name = ext.name || ext.url.split('/').pop()?.replace(/\.js$/, '') || '未知';
                                if (!allExtsMap.has(name)) {
                                    allExtsMap.set(name, {
                                        name: name,
                                        url: ext.url,
                                        source: 'projectData.extensions (object)',
                                        type: 'custom',
                                        isLoaded: info.loadedExtensions.includes(name)
                                    });
                                }
                            }
                        });
                    }

                    if (loadedExts) {
                        Object.keys(loadedExts).forEach(name => {
                            if (!allExtsMap.has(name)) {
                                const ext = loadedExts[name];
                                allExtsMap.set(name, {
                                    name: name,
                                    url: ext.url || '未知',
                                    source: '_loadedExtensions',
                                    type: ext.custom ? 'custom' : 'internal',
                                    isLoaded: true
                                });
                            } else {
                                const existing = allExtsMap.get(name);
                                if (existing.type === 'internal' && (loadedExts[name].custom || loadedExts[name].url)) {
                                    existing.type = 'custom';
                                    existing.url = loadedExts[name].url || existing.url;
                                    existing.source = '_loadedExtensions (updated)';
                                }
                                existing.isLoaded = true;
                            }
                        });
                    }

                    const targets = runtime.targets || [];
                    const builtInExtensions = ['motion', 'looks', 'sound', 'events', 'control', 'sensing', 'operators', 'variables', 'list', 'procedures', 'pen', 'music', 'video', 'text2speech', 'translate', 'makeymakey', 'microbit', 'ev3', 'wedo2', 'boost', 'gdxfor'];
                    targets.forEach(target => {
                        if (target.blocks) {
                            const blocks = target.blocks._blocks || {};
                            Object.values(blocks).forEach(block => {
                                if (block.opcode && block.opcode.includes('.')) {
                                    const extName = block.opcode.split('.')[0];
                                    if (!builtInExtensions.includes(extName) && !allExtsMap.has(extName)) {
                                        allExtsMap.set(extName, {
                                            name: extName,
                                            url: null,
                                            source: 'targets.scan',
                                            type: 'internal',
                                            isLoaded: info.loadedExtensions.includes(extName)
                                        });
                                    }
                                }
                            });
                        }
                    });

                    info.allExtensions = Array.from(allExtsMap.keys());

                    allExtsMap.forEach((ext, name) => {
                        if (ext.type === 'custom') {
                            info.customExtensions.push({
                                name: name,
                                type: 'custom',
                                url: ext.url || '未知',
                                isLoaded: ext.isLoaded || false,
                                source: ext.source || '未知来源',
                                modified: false,
                                originalCode: null,
                                modifiedCode: null
                            });
                        } else {
                            info.internalExtensions.push(name);
                        }
                    });

                    detectMaliciousExtensions(info);

                    if (info.customExtensions.length > 0) {
                        info.isExtensionIntercepted = true;
                    }
                }
            }

        } catch (e) {
            privateLog.addError('获取项目信息失败: ' + e.message);
        }

        return info;
    }

    function detectMaliciousExtensions(info) {
        const suspiciousDomains = [
            'bit.ly', 'tinyurl', 'shorturl', 'goo.gl', 'pastebin',
            'raw.githubusercontent.com', 'gist.github.com'
        ];

        info.customExtensions.forEach(ext => {
            if (ext.url && ext.url !== '未知') {
                suspiciousDomains.forEach(domain => {
                    if (ext.url.includes(domain)) {
                        info.warnings.push(`[${ext.name}] 使用可疑域名: ${domain}`);
                        info.hasMaliciousPatterns = true;
                    }
                });

                if (!ext.url.startsWith(window.location.origin) &&
                    !ext.url.startsWith('https://m.ccw.site/') &&
                    !ext.url.startsWith('https://assets.ccw.site/')) {
                    info.warnings.push(`[${ext.name}] 加载外部资源: ${ext.url}`);
                    info.hasMaliciousPatterns = true;
                }
            }
        });
    }

    // ==================== 获取扩展代码 ====================

    async function fetchExtensionCode(url) {
        return new Promise((resolve) => {
            GM_xmlhttpRequest({
                method: 'GET',
                url: url,
                onload: (r) => resolve(r.responseText),
                onerror: () => resolve(null)
            });
        });
    }

    async function getExtensionCode(extName) {
        const info = await getProjectInfo(true);
        const ext = info.customExtensions.find(e => e.name === extName);
        if (ext && ext.url && ext.url !== '未知') {
            return new Promise((resolve) => {
                GM_xmlhttpRequest({
                    method: 'GET',
                    url: ext.url,
                    onload: (r) => resolve(r.responseText),
                    onerror: () => resolve(null)
                });
            });
        }
        return null;
    }

    // ==================== 修改浏览器标题 ====================

    let originalTitle = document.title;

    function setBrowserTitle(newTitle) {
        if (newTitle && newTitle.trim()) {
            originalTitle = document.title;
            document.title = newTitle.trim();
            return { success: true, title: document.title };
        }
        return { success: false, error: '标题不能为空' };
    }

    function resetBrowserTitle() {
        document.title = originalTitle;
        return { success: true, title: document.title };
    }

    // ==================== 扩展拦截功能 ====================

    let extensionInterceptorResolve = null;
    let interceptedExtensions = [];
    let isInterceptorActive = false;

    function createExtensionInterceptorWindow(extensions, projectData) {
        return new Promise((resolve) => {
            extensionInterceptorResolve = resolve;
            interceptedExtensions = extensions.map(ext => ({ ...ext, allowed: undefined }));
            isInterceptorActive = true;

            const overlay = document.createElement('div');
            overlay.style.cssText = `
                position: fixed;
                top: 0; left: 0; right: 0; bottom: 0;
                background: rgba(0, 0, 0, 0.7);
                z-index: 1000002;
                display: flex;
                align-items: center;
                justify-content: center;
                backdrop-filter: blur(4px);
            `;

            const windowDiv = document.createElement('div');
            windowDiv.style.cssText = `
                background: #1a1a2e;
                border-radius: 16px;
                padding: 24px;
                width: 750px;
                max-width: 95vw;
                max-height: 85vh;
                border: 2px solid #ffb86c;
                box-shadow: 0 20px 60px rgba(0,0,0,0.9);
                color: #eee;
                font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
                display: flex;
                flex-direction: column;
                overflow: hidden;
            `;

            const header = document.createElement('div');
            header.style.cssText = `
                display: flex;
                justify-content: space-between;
                align-items: center;
                padding-bottom: 12px;
                border-bottom: 1px solid rgba(255,255,255,0.1);
                flex-shrink: 0;
            `;

            const title = document.createElement('span');
            title.style.cssText = `
                font-size: 20px;
                font-weight: 600;
                color: #ffb86c;
                display: flex;
                align-items: center;
                gap: 10px;
            `;
            title.innerHTML = `🔌 扩展拦截 - 请审查以下扩展 (${extensions.length}个)`;

            const closeBtn = document.createElement('button');
            closeBtn.textContent = '✕';
            closeBtn.style.cssText = `
                background: none;
                border: none;
                color: #6272a4;
                font-size: 22px;
                cursor: pointer;
                padding: 0 8px;
            `;
            closeBtn.onclick = () => {
                if (confirm('确定要关闭拦截窗口吗？项目将不会加载这些扩展。')) {
                    overlay.remove();
                    isInterceptorActive = false;
                    if (extensionInterceptorResolve) {
                        extensionInterceptorResolve({ action: 'cancel', extensions: interceptedExtensions });
                    }
                }
            };
            header.appendChild(title);
            header.appendChild(closeBtn);
            windowDiv.appendChild(header);

            const warning = document.createElement('div');
            warning.style.cssText = `
                padding: 8px 12px;
                background: rgba(255,181,0,0.15);
                border: 1px solid rgba(255,181,0,0.3);
                border-radius: 8px;
                margin: 12px 0;
                font-size: 13px;
                color: #ffb86c;
                flex-shrink: 0;
            `;
            warning.textContent = '⚠️ 请仔细审查每个扩展的代码，确认安全后再加载。可疑扩展请拒绝加载。';
            windowDiv.appendChild(warning);

            const listContainer = document.createElement('div');
            listContainer.style.cssText = `
                flex: 1;
                overflow-y: auto;
                margin: 8px 0;
                padding-right: 4px;
            `;

            const extElements = [];

            interceptedExtensions.forEach((ext, index) => {
                const extDiv = document.createElement('div');
                extDiv.style.cssText = `
                    background: rgba(255,255,255,0.03);
                    border-radius: 8px;
                    padding: 12px;
                    margin-bottom: 10px;
                    border-left: 3px solid ${ext.isLoaded ? '#50fa7b' : '#ffb86c'};
                    transition: all 0.3s;
                `;

                const headerRow = document.createElement('div');
                headerRow.style.cssText = `
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    flex-wrap: wrap;
                    gap: 8px;
                `;

                const nameSpan = document.createElement('span');
                nameSpan.style.cssText = `
                    font-weight: 600;
                    font-size: 15px;
                    color: #f8f8f2;
                    display: flex;
                    align-items: center;
                    gap: 10px;
                `;
                nameSpan.innerHTML = `📦 ${ext.name}`;
                headerRow.appendChild(nameSpan);

                const statusRow = document.createElement('div');
                statusRow.style.cssText = `
                    display: flex;
                    align-items: center;
                    gap: 10px;
                    flex-wrap: wrap;
                `;

                const statusSpan = document.createElement('span');
                statusSpan.style.cssText = `
                    font-size: 11px;
                    padding: 2px 10px;
                    border-radius: 12px;
                    background: ${ext.isLoaded ? 'rgba(80,250,123,0.2)' : 'rgba(255,184,108,0.2)'};
                    color: ${ext.isLoaded ? '#50fa7b' : '#ffb86c'};
                `;
                statusSpan.textContent = ext.isLoaded ? '✅ 已加载' : '⏳ 未加载';
                statusRow.appendChild(statusSpan);

                const modifiedSpan = document.createElement('span');
                modifiedSpan.style.cssText = `
                    font-size: 11px;
                    padding: 2px 10px;
                    border-radius: 12px;
                    background: rgba(255,85,85,0.2);
                    color: #ff5555;
                    display: ${ext.modified ? 'inline-block' : 'none'};
                `;
                modifiedSpan.textContent = '✏️ 已修改';
                modifiedSpan.id = `modified-${index}`;
                statusRow.appendChild(modifiedSpan);

                headerRow.appendChild(statusRow);
                extDiv.appendChild(headerRow);

                const urlSpan = document.createElement('div');
                urlSpan.style.cssText = `
                    color: #6272a4;
                    font-size: 12px;
                    word-break: break-all;
                    margin-top: 4px;
                    font-family: monospace;
                `;
                urlSpan.textContent = `🔗 ${ext.url}`;
                extDiv.appendChild(urlSpan);

                if (ext.source) {
                    const sourceSpan = document.createElement('div');
                    sourceSpan.style.cssText = `
                        color: #6272a4;
                        font-size: 11px;
                        margin-top: 2px;
                    `;
                    sourceSpan.textContent = `来源: ${ext.source}`;
                    extDiv.appendChild(sourceSpan);
                }

                const btnGroup = document.createElement('div');
                btnGroup.style.cssText = `
                    display: flex;
                    gap: 8px;
                    margin-top: 10px;
                    flex-wrap: wrap;
                `;

                const viewBtn = document.createElement('button');
                viewBtn.textContent = '📝 查看/修改代码';
                viewBtn.style.cssText = `
                    padding: 4px 14px;
                    background: rgba(102,126,234,0.2);
                    border: 1px solid rgba(102,126,234,0.3);
                    border-radius: 4px;
                    color: #8be9fd;
                    cursor: pointer;
                    font-size: 12px;
                    transition: all 0.2s;
                `;
                viewBtn.onmouseover = () => viewBtn.style.background = 'rgba(102,126,234,0.4)';
                viewBtn.onmouseout = () => viewBtn.style.background = 'rgba(102,126,234,0.2)';
                viewBtn.onclick = async function() {
                    await showCodeEditor(ext, index, modifiedSpan, extDiv);
                };
                btnGroup.appendChild(viewBtn);

                const allowBtn = document.createElement('button');
                allowBtn.textContent = '✅ 允许加载';
                allowBtn.className = 'allow-btn';
                allowBtn.style.cssText = `
                    padding: 4px 14px;
                    background: rgba(80,250,123,0.15);
                    border: 1px solid rgba(80,250,123,0.3);
                    border-radius: 4px;
                    color: #50fa7b;
                    cursor: pointer;
                    font-size: 12px;
                    transition: all 0.2s;
                `;
                allowBtn.onmouseover = () => allowBtn.style.background = 'rgba(80,250,123,0.3)';
                allowBtn.onmouseout = () => allowBtn.style.background = 'rgba(80,250,123,0.15)';
                allowBtn.onclick = function() {
                    ext.allowed = true;
                    extDiv.style.borderLeftColor = '#50fa7b';
                    this.textContent = '✅ 已允许';
                    this.style.background = 'rgba(80,250,123,0.3)';
                    this.disabled = true;
                    const rejectBtn = btnGroup.querySelector('.reject-btn');
                    if (rejectBtn) {
                        rejectBtn.textContent = '❌ 已拒绝';
                        rejectBtn.style.background = 'rgba(255,85,85,0.1)';
                        rejectBtn.disabled = true;
                    }
                };
                btnGroup.appendChild(allowBtn);

                const rejectBtn = document.createElement('button');
                rejectBtn.textContent = '❌ 拒绝';
                rejectBtn.className = 'reject-btn';
                rejectBtn.style.cssText = `
                    padding: 4px 14px;
                    background: rgba(255,85,85,0.15);
                    border: 1px solid rgba(255,85,85,0.3);
                    border-radius: 4px;
                    color: #ff5555;
                    cursor: pointer;
                    font-size: 12px;
                    transition: all 0.2s;
                `;
                rejectBtn.onmouseover = () => rejectBtn.style.background = 'rgba(255,85,85,0.3)';
                rejectBtn.onmouseout = () => rejectBtn.style.background = 'rgba(255,85,85,0.15)';
                rejectBtn.onclick = function() {
                    ext.allowed = false;
                    extDiv.style.borderLeftColor = '#ff5555';
                    this.textContent = '❌ 已拒绝';
                    this.style.background = 'rgba(255,85,85,0.3)';
                    this.disabled = true;
                    const allowBtn2 = btnGroup.querySelector('.allow-btn');
                    if (allowBtn2) {
                        allowBtn2.textContent = '✅ 已允许';
                        allowBtn2.style.background = 'rgba(80,250,123,0.1)';
                        allowBtn2.disabled = true;
                    }
                };
                btnGroup.appendChild(rejectBtn);

                extDiv.appendChild(btnGroup);
                listContainer.appendChild(extDiv);
                extElements.push(extDiv);
            });

            windowDiv.appendChild(listContainer);

            const footer = document.createElement('div');
            footer.style.cssText = `
                display: flex;
                gap: 12px;
                padding-top: 12px;
                border-top: 1px solid rgba(255,255,255,0.1);
                flex-shrink: 0;
                flex-wrap: wrap;
                justify-content: space-between;
                align-items: center;
            `;

            const leftGroup = document.createElement('div');
            leftGroup.style.cssText = 'display:flex;gap:8px;flex-wrap:wrap;';

            const allowAllBtn = document.createElement('button');
            allowAllBtn.textContent = '✅ 全部允许';
            allowAllBtn.style.cssText = `
                padding: 8px 20px;
                background: rgba(80,250,123,0.2);
                border: 1px solid rgba(80,250,123,0.4);
                border-radius: 8px;
                color: #50fa7b;
                cursor: pointer;
                font-size: 14px;
                font-weight: 600;
                transition: all 0.2s;
            `;
            allowAllBtn.onmouseover = () => allowAllBtn.style.background = 'rgba(80,250,123,0.3)';
            allowAllBtn.onmouseout = () => allowAllBtn.style.background = 'rgba(80,250,123,0.2)';
            allowAllBtn.onclick = function() {
                interceptedExtensions.forEach(ext => { ext.allowed = true; });
                extElements.forEach((el) => {
                    el.style.borderLeftColor = '#50fa7b';
                    const btns = el.querySelectorAll('button');
                    btns.forEach(btn => {
                        if (btn.textContent.includes('允许')) {
                            btn.textContent = '✅ 已允许';
                            btn.style.background = 'rgba(80,250,123,0.3)';
                            btn.disabled = true;
                        }
                        if (btn.textContent.includes('拒绝') && !btn.textContent.includes('已拒绝')) {
                            btn.textContent = '❌ 已拒绝';
                            btn.style.background = 'rgba(255,85,85,0.1)';
                            btn.disabled = true;
                        }
                    });
                });
            };
            leftGroup.appendChild(allowAllBtn);

            const rejectAllBtn = document.createElement('button');
            rejectAllBtn.textContent = '❌ 全部拒绝';
            rejectAllBtn.style.cssText = `
                padding: 8px 20px;
                background: rgba(255,85,85,0.2);
                border: 1px solid rgba(255,85,85,0.4);
                border-radius: 8px;
                color: #ff5555;
                cursor: pointer;
                font-size: 14px;
                font-weight: 600;
                transition: all 0.2s;
            `;
            rejectAllBtn.onmouseover = () => rejectAllBtn.style.background = 'rgba(255,85,85,0.3)';
            rejectAllBtn.onmouseout = () => rejectAllBtn.style.background = 'rgba(255,85,85,0.2)';
            rejectAllBtn.onclick = function() {
                interceptedExtensions.forEach(ext => { ext.allowed = false; });
                extElements.forEach((el) => {
                    el.style.borderLeftColor = '#ff5555';
                    const btns = el.querySelectorAll('button');
                    btns.forEach(btn => {
                        if (btn.textContent.includes('拒绝') && !btn.textContent.includes('已拒绝')) {
                            btn.textContent = '❌ 已拒绝';
                            btn.style.background = 'rgba(255,85,85,0.3)';
                            btn.disabled = true;
                        }
                        if (btn.textContent.includes('允许') && !btn.textContent.includes('已允许')) {
                            btn.textContent = '✅ 已允许';
                            btn.style.background = 'rgba(80,250,123,0.1)';
                            btn.disabled = true;
                        }
                    });
                });
            };
            leftGroup.appendChild(rejectAllBtn);

            const continueBtn = document.createElement('button');
            continueBtn.textContent = '▶ 继续加载项目';
            continueBtn.style.cssText = `
                padding: 8px 24px;
                background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                border: none;
                border-radius: 8px;
                color: white;
                cursor: pointer;
                font-size: 14px;
                font-weight: 600;
                transition: all 0.2s;
            `;
            continueBtn.onmouseover = () => continueBtn.style.opacity = '0.9';
            continueBtn.onmouseout = () => continueBtn.style.opacity = '1';
            continueBtn.onclick = function() {
                const pending = interceptedExtensions.filter(ext => ext.allowed === undefined);
                if (pending.length > 0) {
                    if (!confirm(`还有 ${pending.length} 个扩展未选择允许/拒绝，确定要继续吗？未选择的扩展将不会被加载。`)) {
                        return;
                    }
                }
                overlay.remove();
                isInterceptorActive = false;
                if (extensionInterceptorResolve) {
                    extensionInterceptorResolve({
                        action: 'continue',
                        extensions: interceptedExtensions
                    });
                }
            };

            footer.appendChild(leftGroup);
            footer.appendChild(continueBtn);
            windowDiv.appendChild(footer);

            overlay.appendChild(windowDiv);
            document.body.appendChild(overlay);
        });
    }

    // ==================== 代码编辑器 ====================

    async function showCodeEditor(ext, index, modifiedSpan, extDiv) {
        let code = ext.modifiedCode || ext.originalCode;
        if (!code) {
            code = await fetchExtensionCode(ext.url);
            if (code) {
                ext.originalCode = code;
            } else {
                alert(`无法获取扩展 "${ext.name}" 的代码`);
                return;
            }
        }

        const overlay = document.createElement('div');
        overlay.style.cssText = `
            position: fixed;
            top: 0; left: 0; right: 0; bottom: 0;
            background: rgba(0, 0, 0, 0.8);
            z-index: 1000003;
            display: flex;
            align-items: center;
            justify-content: center;
            backdrop-filter: blur(4px);
        `;

        const dialog = document.createElement('div');
        dialog.style.cssText = `
            background: #1a1a2e;
            border-radius: 16px;
            padding: 24px;
            width: 85%;
            max-width: 800px;
            max-height: 85vh;
            border: 2px solid #8be9fd;
            box-shadow: 0 20px 60px rgba(0,0,0,0.9);
            color: #eee;
            display: flex;
            flex-direction: column;
            overflow: hidden;
        `;

        const header = document.createElement('div');
        header.style.cssText = `
            display: flex;
            justify-content: space-between;
            align-items: center;
            padding-bottom: 12px;
            border-bottom: 1px solid rgba(255,255,255,0.1);
            flex-shrink: 0;
        `;

        const title = document.createElement('span');
        title.style.cssText = `
            font-size: 18px;
            font-weight: 600;
            color: #8be9fd;
        `;
        title.textContent = `📝 编辑扩展: ${ext.name}`;
        header.appendChild(title);

        const closeBtn = document.createElement('button');
        closeBtn.textContent = '✕';
        closeBtn.style.cssText = `
            background: none;
            border: none;
            color: #6272a4;
            font-size: 22px;
            cursor: pointer;
            padding: 0 8px;
        `;
        closeBtn.onclick = () => overlay.remove();
        header.appendChild(closeBtn);
        dialog.appendChild(header);

        const textarea = document.createElement('textarea');
        textarea.style.cssText = `
            width: 100%;
            height: 400px;
            margin: 12px 0;
            background: rgba(0,0,0,0.4);
            color: #f8f8f2;
            border: 1px solid rgba(255,255,255,0.1);
            border-radius: 8px;
            padding: 12px;
            font-family: 'Courier New', monospace;
            font-size: 12px;
            resize: vertical;
            box-sizing: border-box;
            tab-size: 2;
            line-height: 1.6;
        `;
        textarea.value = code;
        dialog.appendChild(textarea);

        const footer = document.createElement('div');
        footer.style.cssText = `
            display: flex;
            gap: 12px;
            justify-content: flex-end;
            flex-shrink: 0;
            padding-top: 8px;
        `;

        const cancelBtn = document.createElement('button');
        cancelBtn.textContent = '取消';
        cancelBtn.style.cssText = `
            padding: 8px 20px;
            background: rgba(255,255,255,0.05);
            border: 1px solid rgba(255,255,255,0.1);
            border-radius: 8px;
            color: #6272a4;
            cursor: pointer;
            font-size: 14px;
            transition: all 0.2s;
        `;
        cancelBtn.onmouseover = () => cancelBtn.style.background = 'rgba(255,255,255,0.1)';
        cancelBtn.onmouseout = () => cancelBtn.style.background = 'rgba(255,255,255,0.05)';
        cancelBtn.onclick = () => overlay.remove();

        const saveBtn = document.createElement('button');
        saveBtn.textContent = '💾 保存修改';
        saveBtn.style.cssText = `
            padding: 8px 24px;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            border: none;
            border-radius: 8px;
            color: white;
            cursor: pointer;
            font-size: 14px;
            font-weight: 600;
            transition: all 0.2s;
        `;
        saveBtn.onmouseover = () => saveBtn.style.opacity = '0.9';
        saveBtn.onmouseout = () => saveBtn.style.opacity = '1';
        saveBtn.onclick = function() {
            const newCode = textarea.value;
            if (newCode !== ext.originalCode) {
                ext.modifiedCode = newCode;
                ext.modified = true;
                if (modifiedSpan) {
                    modifiedSpan.style.display = 'inline-block';
                    modifiedSpan.animate([
                        { transform: 'scale(0.8)', opacity: '0' },
                        { transform: 'scale(1.2)', opacity: '1' },
                        { transform: 'scale(1)', opacity: '1' }
                    ], { duration: 300 });
                }
                if (extDiv) {
                    extDiv.style.borderLeftColor = '#ffb86c';
                }
            }
            overlay.remove();
        };

        footer.appendChild(cancelBtn);
        footer.appendChild(saveBtn);
        dialog.appendChild(footer);

        overlay.appendChild(dialog);
        document.body.appendChild(overlay);
        setTimeout(() => textarea.focus(), 100);
    }

    // ==================== 修改扩展代码 ====================

    async function modifyExtensionCode(extName, newCode) {
        if (!vmInstance) {
            await vmPromise;
            if (!vmInstance) {
                privateLog.addError('VM未就绪，无法修改扩展');
                return { success: false, error: 'VM未就绪' };
            }
        }

        try {
            const extensionManager = vmInstance.extensionManager;
            if (!extensionManager) {
                return { success: false, error: '扩展管理器未找到' };
            }

            const loadedExts = extensionManager._loadedExtensions || {};
            if (!loadedExts[extName]) {
                return { success: false, error: `扩展 ${extName} 未加载` };
            }

            const ext = loadedExts[extName];
            if (ext.custom || ext.url) {
                const blob = new Blob([newCode], { type: 'application/javascript' });
                const url = URL.createObjectURL(blob);
                const originalUrl = ext.url;

                await extensionManager.loadExtensionURL(url);
                loadedExts[extName].url = url;
                loadedExts[extName].originalUrl = originalUrl;

                return {
                    success: true,
                    message: `扩展 ${extName} 已修改`,
                    newUrl: url,
                    originalUrl: originalUrl
                };
            }

            return { success: false, error: '仅支持自定义扩展的修改' };
        } catch (e) {
            privateLog.addError('修改扩展失败: ' + e.message);
            return { success: false, error: e.message };
        }
    }

    // ==================== 劫持 loadProject ====================

    function setupExtensionInterceptor() {
        vmPromise.then((vm) => {
            if (!vm) return;

            const originalLoadProject = vm.loadProject;
            vm.loadProject = async function(input) {
                let projectData = null;
                let JSZip = null;

                try {
                    if (vm.exports?.JSZip) {
                        JSZip = vm.exports.JSZip;
                    } else if (window.JSZip) {
                        JSZip = window.JSZip;
                    }

                    let projectJson = null;

                    if (typeof input === 'string') {
                        projectJson = JSON.parse(input);
                    } else if (input instanceof ArrayBuffer || input instanceof Uint8Array) {
                        if (JSZip) {
                            const zip = await JSZip.loadAsync(input);
                            const file = zip.file('project.json');
                            if (file) {
                                const content = await file.async('string');
                                projectJson = JSON.parse(content);
                            }
                        }
                    } else if (input && typeof input === 'object') {
                        if (input.file) {
                            const file = input.file('project.json');
                            if (file) {
                                const content = await file.async('string');
                                projectJson = JSON.parse(content);
                            }
                        } else {
                            projectJson = input;
                        }
                    }

                    if (projectJson) {
                        const customExts = [];
                        const extMap = new Map();

                        if (projectJson.gandi?.wildExtensions) {
                            Object.entries(projectJson.gandi.wildExtensions).forEach(([name, data]) => {
                                extMap.set(name, {
                                    name: name,
                                    url: data.url || data.assetUri || '未知',
                                    source: 'gandi.wildExtensions',
                                    allowed: undefined,
                                    modified: false,
                                    originalCode: null,
                                    modifiedCode: null,
                                    isLoaded: false
                                });
                            });
                        }

                        if (projectJson.extensionURLs) {
                            Object.entries(projectJson.extensionURLs).forEach(([name, url]) => {
                                if (!extMap.has(name)) {
                                    extMap.set(name, {
                                        name: name,
                                        url: url,
                                        source: 'extensionURLs',
                                        allowed: undefined,
                                        modified: false,
                                        originalCode: null,
                                        modifiedCode: null,
                                        isLoaded: false
                                    });
                                }
                            });
                        }

                        if (projectJson.extensions) {
                            projectJson.extensions.forEach(ext => {
                                if (typeof ext === 'string') {
                                    if (!extMap.has(ext)) {
                                        extMap.set(ext, {
                                            name: ext,
                                            url: null,
                                            source: 'projectData.extensions (string)',
                                            allowed: undefined,
                                            modified: false,
                                            originalCode: null,
                                            modifiedCode: null,
                                            isLoaded: false
                                        });
                                    }
                                } else if (typeof ext === 'object' && ext.url) {
                                    const name = ext.name || ext.url.split('/').pop()?.replace(/\.js$/, '') || '未知';
                                    if (!extMap.has(name)) {
                                        extMap.set(name, {
                                            name: name,
                                            url: ext.url,
                                            source: 'projectData.extensions (object)',
                                            allowed: undefined,
                                            modified: false,
                                            originalCode: null,
                                            modifiedCode: null,
                                            isLoaded: false
                                        });
                                    }
                                }
                            });
                        }

                        extMap.forEach((ext) => {
                            const isCustom =
                                ext.source === 'gandi.wildExtensions' ||
                                ext.source === 'extensionURLs' ||
                                (ext.source === 'projectData.extensions (object)' && ext.url);

                            if (isCustom) {
                                customExts.push(ext);
                            }
                        });

                        if (customExts.length > 0) {
                            const result = await createExtensionInterceptorWindow(customExts, projectJson);

                            if (result.action === 'continue') {
                                const modifiedExts = result.extensions.filter(e => e.modified === true);

                                if (projectJson.gandi?.wildExtensions) {
                                    Object.keys(projectJson.gandi.wildExtensions).forEach(name => {
                                        const ext = result.extensions.find(e => e.name === name);
                                        if (ext && !ext.allowed) {
                                            delete projectJson.gandi.wildExtensions[name];
                                        }
                                    });
                                }

                                if (projectJson.extensions) {
                                    projectJson.extensions = projectJson.extensions.filter(ext => {
                                        let name;
                                        if (typeof ext === 'string') {
                                            name = ext;
                                        } else if (typeof ext === 'object' && ext.url) {
                                            name = ext.name || '未知';
                                        }
                                        if (name) {
                                            const extResult = result.extensions.find(e => e.name === name);
                                            return extResult ? extResult.allowed !== false : true;
                                        }
                                        return true;
                                    });
                                }

                                for (const ext of modifiedExts) {
                                    if (ext.allowed && ext.modifiedCode) {
                                        const blob = new Blob([ext.modifiedCode], { type: 'application/javascript' });
                                        const url = URL.createObjectURL(blob);
                                        if (projectJson.gandi?.wildExtensions?.[ext.name]) {
                                            projectJson.gandi.wildExtensions[ext.name].url = url;
                                            projectJson.gandi.wildExtensions[ext.name]._originalUrl = ext.url;
                                        }
                                        if (projectJson.extensionURLs?.[ext.name]) {
                                            projectJson.extensionURLs[ext.name] = url;
                                        }
                                    }
                                }

                                const newInput = JSON.stringify(projectJson);
                                return originalLoadProject.call(vm, newInput);
                            } else {
                                return Promise.reject(new Error('扩展加载被用户取消'));
                            }
                        }
                    }
                } catch (e) {
                    privateLog.addError('扩展拦截处理失败: ' + e.message);
                }

                return originalLoadProject.call(vm, input);
            };

            if (vm.runtime) {
                const originalRuntimeLoad = vm.runtime.loadProject;
                vm.runtime.loadProject = function(input) {
                    return vm.loadProject(input);
                };
            }
        });
    }

    // ==================== 等待DOM就绪 ====================

    function waitForBody() {
        return new Promise((resolve) => {
            if (document.body) {
                resolve();
                return;
            }

            let timeoutId = setTimeout(() => {
                observer.disconnect();
                if (!document.body) {
                    const body = document.createElement('body');
                    document.documentElement.appendChild(body);
                }
                resolve();
            }, 3000);

            const observer = new MutationObserver(() => {
                if (document.body) {
                    observer.disconnect();
                    clearTimeout(timeoutId);
                    resolve();
                }
            });
            observer.observe(document.documentElement, { childList: true, subtree: true });
        });
    }

    // ==================== 创建悬浮球 ====================

    async function createFloatingBall() {
        await waitForBody();

        if (document.querySelector('.csrt-ball')) {
            return document.querySelector('.csrt-ball');
        }

        const ball = document.createElement('div');
        ball.className = 'csrt-ball';
        ball.style.cssText = `
            position: fixed;
            width: 50px;
            height: 50px;
            border-radius: 50%;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            color: white;
            font-size: 22px;
            display: flex;
            align-items: center;
            justify-content: center;
            cursor: pointer;
            z-index: 999999;
            box-shadow: 0 4px 15px rgba(0,0,0,0.3);
            user-select: none;
            pointer-events: auto;
            border: 2px solid rgba(255,255,255,0.2);
            will-change: transform, left, top;
            touch-action: none;
            contain: layout style paint;
        `;
        ball.textContent = '🔬';
        ball.title = 'CSRT - CCW安全研究工具 | 作者: 110200 | v2.6.0';

        requestAnimationFrame(() => {
            const x = window.innerWidth - 70;
            const y = window.innerHeight - 130;
            ball.style.left = x + 'px';
            ball.style.top = y + 'px';
            ball.style.right = 'auto';
            ball.style.bottom = 'auto';
        });

        let isDragging = false;
        let hasPositionChanged = false;
        let offsetX = 0, offsetY = 0;
        let currentX = window.innerWidth - 70;
        let currentY = window.innerHeight - 130;
        let targetX = currentX;
        let targetY = currentY;
        let animationId = null;

        function animateSmooth() {
            const dx = targetX - currentX;
            const dy = targetY - currentY;

            currentX += dx * 0.25;
            currentY += dy * 0.25;

            if (Math.abs(dx) < 0.5 && Math.abs(dy) < 0.5) {
                currentX = targetX;
                currentY = targetY;
            }

            ball.style.left = currentX + 'px';
            ball.style.top = currentY + 'px';

            if (Math.abs(targetX - currentX) > 0.1 || Math.abs(targetY - currentY) > 0.1) {
                animationId = requestAnimationFrame(animateSmooth);
            } else {
                animationId = null;
            }
        }

        function startSmoothMove() {
            if (animationId) {
                cancelAnimationFrame(animationId);
                animationId = null;
            }
            animateSmooth();
        }

        ball.addEventListener('mousedown', (e) => {
            if (e.button !== 0) return;
            isDragging = true;
            hasPositionChanged = false;
            const rect = ball.getBoundingClientRect();
            offsetX = e.clientX - rect.left;
            offsetY = e.clientY - rect.top;
            ball.style.cursor = 'grabbing';
            ball.style.transform = 'scale(1.15)';
            ball.style.boxShadow = '0 8px 30px rgba(102, 126, 234, 0.6)';
            e.preventDefault();
        });

        document.addEventListener('mousemove', (e) => {
            if (!isDragging) return;

            let newX = e.clientX - offsetX;
            let newY = e.clientY - offsetY;

            const maxX = window.innerWidth - 60;
            const maxY = window.innerHeight - 60;
            newX = Math.max(0, Math.min(newX, maxX));
            newY = Math.max(0, Math.min(newY, maxY));

            if (Math.abs(newX - targetX) > 2 || Math.abs(newY - targetY) > 2) {
                hasPositionChanged = true;
            }

            targetX = newX;
            targetY = newY;

            if (!animationId) {
                startSmoothMove();
            }
        });

        document.addEventListener('mouseup', (e) => {
            if (isDragging) {
                isDragging = false;
                ball.style.cursor = 'pointer';
                ball.style.transform = 'scale(1)';
                ball.style.boxShadow = '0 4px 15px rgba(0,0,0,0.3)';

                if (!hasPositionChanged) {
                    toggleToolWindow();
                }
                e.preventDefault();
            }
        });

        // 触摸事件
        let touchOffsetX = 0, touchOffsetY = 0;
        let isTouching = false;
        let touchHasMoved = false;

        ball.addEventListener('touchstart', (e) => {
            const touch = e.touches[0];
            const rect = ball.getBoundingClientRect();
            touchOffsetX = touch.clientX - rect.left;
            touchOffsetY = touch.clientY - rect.top;
            isTouching = true;
            touchHasMoved = false;
            ball.style.transform = 'scale(1.15)';
            ball.style.boxShadow = '0 8px 30px rgba(102, 126, 234, 0.6)';
            e.preventDefault();
        }, {passive: false});

        document.addEventListener('touchmove', (e) => {
            if (!isTouching) return;
            const touch = e.touches[0];

            let newX = touch.clientX - touchOffsetX;
            let newY = touch.clientY - touchOffsetY;

            const maxX = window.innerWidth - 60;
            const maxY = window.innerHeight - 60;
            newX = Math.max(0, Math.min(newX, maxX));
            newY = Math.max(0, Math.min(newY, maxY));

            if (Math.abs(newX - targetX) > 2 || Math.abs(newY - targetY) > 2) {
                touchHasMoved = true;
            }

            targetX = newX;
            targetY = newY;

            if (!animationId) {
                startSmoothMove();
            }
            e.preventDefault();
        }, {passive: false});

        document.addEventListener('touchend', (e) => {
            if (isTouching) {
                isTouching = false;
                ball.style.transform = 'scale(1)';
                ball.style.boxShadow = '0 4px 15px rgba(0,0,0,0.3)';

                if (!touchHasMoved) {
                    toggleToolWindow();
                }
            }
        }, {passive: false});

        window.addEventListener('resize', () => {
            const maxX = window.innerWidth - 60;
            const maxY = window.innerHeight - 60;
            targetX = Math.min(targetX, maxX);
            targetY = Math.min(targetY, maxY);
            if (!animationId) {
                startSmoothMove();
            }
        });

        document.body.appendChild(ball);
        return ball;
    }

    // ==================== Toast 通知 ====================

    function showToast(message) {
        const toast = document.createElement('div');
        toast.style.cssText = `
            position: fixed;
            bottom: 100px;
            left: 50%;
            transform: translateX(-50%);
            padding: 10px 24px;
            background: #1a1a2e;
            border: 1px solid rgba(255,255,255,0.1);
            border-radius: 8px;
            color: #f8f8f2;
            font-size: 14px;
            z-index: 1000004;
            box-shadow: 0 4px 20px rgba(0,0,0,0.5);
            animation: csrt-toast-in 0.3s ease-out;
        `;
        toast.textContent = message;
        document.body.appendChild(toast);
        setTimeout(() => {
            toast.style.animation = 'csrt-toast-out 0.3s ease-in';
            setTimeout(() => toast.remove(), 300);
        }, 2000);

        if (!document.getElementById('csrt-toast-style')) {
            const style = document.createElement('style');
            style.id = 'csrt-toast-style';
            style.textContent = `
                @keyframes csrt-toast-in {
                    from { opacity: 0; transform: translateX(-50%) translateY(20px); }
                    to { opacity: 1; transform: translateX(-50%) translateY(0); }
                }
                @keyframes csrt-toast-out {
                    from { opacity: 1; transform: translateX(-50%) translateY(0); }
                    to { opacity: 0; transform: translateX(-50%) translateY(20px); }
                }
            `;
            document.head.appendChild(style);
        }
    }

    // ==================== 应用功能设置 ====================

    function applyFeatureSettings() {}

    // ==================== 实时监控悬浮窗 ====================

    let monitorEnabled = false;
    let monitorPanel = null;
    let monitorInterval = null;
    let fpsCounter = 0;
    let fpsValue = 0;
    let lastFpsUpdate = 0;
    let requestCount = 0;
    let latencyValue = 0;
    let startTime = Date.now();
    let isMonitoring = false;

    function setupRequestCounting() {
        const originalFetch = window.fetch;
        window.fetch = function(...args) {
            requestCount++;
            return originalFetch.apply(this, args);
        };

        const XHR = XMLHttpRequest.prototype;
        const originalXHRSend = XHR.send;
        XHR.send = function(data) {
            requestCount++;
            return originalXHRSend.apply(this, arguments);
        };
    }

    function measureLatency() {
        const start = performance.now();
        fetch('/favicon.ico?' + Date.now(), { cache: 'no-store', mode: 'no-cors' })
            .catch(() => {})
            .finally(() => {
                const end = performance.now();
                latencyValue = Math.round(end - start);
            });
    }

    function createMonitorPanel() {
        if (document.querySelector('.csrt-monitor')) {
            return document.querySelector('.csrt-monitor');
        }

        const panel = document.createElement('div');
        panel.className = 'csrt-monitor';
        panel.style.cssText = `
            position: fixed;
            bottom: 140px;
            right: 20px;
            background: rgba(26, 26, 46, 0.92);
            backdrop-filter: blur(8px);
            border: 1px solid rgba(255,255,255,0.1);
            border-radius: 10px;
            padding: 10px 14px;
            z-index: 999998;
            color: #f8f8f2;
            font-family: 'Courier New', monospace;
            font-size: 12px;
            min-width: 140px;
            box-shadow: 0 4px 20px rgba(0,0,0,0.5);
            user-select: none;
            cursor: move;
            touch-action: none;
            contain: layout style paint;
            transition: opacity 0.3s ease;
            opacity: 1;
        `;
        panel.innerHTML = `
            <div style="display:flex;flex-direction:column;gap:3px;">
                <div style="display:flex;justify-content:space-between;align-items:center;">
                    <span>📊 延迟</span>
                    <span id="csrt-latency" style="color:#8be9fd;">--ms</span>
                </div>
                <div style="display:flex;justify-content:space-between;align-items:center;">
                    <span>🔄 FPS</span>
                    <span id="csrt-fps" style="color:#50fa7b;">--</span>
                </div>
                <div style="display:flex;justify-content:space-between;align-items:center;">
                    <span>📡 请求</span>
                    <span id="csrt-requests" style="color:#f1fa8c;">0</span>
                </div>
                <div style="display:flex;justify-content:space-between;align-items:center;border-top:1px solid rgba(255,255,255,0.05);padding-top:3px;margin-top:2px;">
                    <span style="font-size:10px;color:#6272a4;">⏱️</span>
                    <span id="csrt-uptime" style="font-size:10px;color:#6272a4;">00:00</span>
                </div>
            </div>
        `;

        let isDraggingPanel = false;
        let panelOffsetX = 0, panelOffsetY = 0;

        panel.addEventListener('mousedown', (e) => {
            isDraggingPanel = true;
            const rect = panel.getBoundingClientRect();
            panelOffsetX = e.clientX - rect.left;
            panelOffsetY = e.clientY - rect.top;
            panel.style.cursor = 'grabbing';
            e.preventDefault();
        });

        document.addEventListener('mousemove', (e) => {
            if (!isDraggingPanel) return;
            let newX = e.clientX - panelOffsetX;
            let newY = e.clientY - panelOffsetY;
            const maxX = window.innerWidth - panel.offsetWidth - 10;
            const maxY = window.innerHeight - panel.offsetHeight - 10;
            newX = Math.max(10, Math.min(newX, maxX));
            newY = Math.max(10, Math.min(newY, maxY));
            panel.style.left = newX + 'px';
            panel.style.top = newY + 'px';
            panel.style.right = 'auto';
            panel.style.bottom = 'auto';
        });

        document.addEventListener('mouseup', () => {
            if (isDraggingPanel) {
                isDraggingPanel = false;
                panel.style.cursor = 'move';
            }
        });

        let touchPanelOffsetX = 0, touchPanelOffsetY = 0;
        let isTouchingPanel = false;

        panel.addEventListener('touchstart', (e) => {
            const touch = e.touches[0];
            const rect = panel.getBoundingClientRect();
            touchPanelOffsetX = touch.clientX - rect.left;
            touchPanelOffsetY = touch.clientY - rect.top;
            isTouchingPanel = true;
            e.preventDefault();
        }, {passive: false});

        document.addEventListener('touchmove', (e) => {
            if (!isTouchingPanel) return;
            const touch = e.touches[0];
            let newX = touch.clientX - touchPanelOffsetX;
            let newY = touch.clientY - touchPanelOffsetY;
            const maxX = window.innerWidth - panel.offsetWidth - 10;
            const maxY = window.innerHeight - panel.offsetHeight - 10;
            newX = Math.max(10, Math.min(newX, maxX));
            newY = Math.max(10, Math.min(newY, maxY));
            panel.style.left = newX + 'px';
            panel.style.top = newY + 'px';
            panel.style.right = 'auto';
            panel.style.bottom = 'auto';
            e.preventDefault();
        }, {passive: false});

        document.addEventListener('touchend', () => {
            isTouchingPanel = false;
        });

        document.body.appendChild(panel);
        return panel;
    }

    function startMonitor() {
        if (isMonitoring) return;
        isMonitoring = true;
        startTime = Date.now();

        monitorPanel = createMonitorPanel();

        setupRequestCounting();

        measureLatency();

        let frameCount = 0;
        let lastFpsTime = performance.now();

        function countFPS() {
            frameCount++;
            const now = performance.now();
            if (now - lastFpsTime >= 1000) {
                fpsValue = frameCount;
                frameCount = 0;
                lastFpsTime = now;
                updateDisplay();
            }
            if (isMonitoring) {
                requestAnimationFrame(countFPS);
            }
        }

        function updateDisplay() {
            const latencyEl = document.getElementById('csrt-latency');
            const fpsEl = document.getElementById('csrt-fps');
            const reqEl = document.getElementById('csrt-requests');
            const uptimeEl = document.getElementById('csrt-uptime');

            if (latencyEl) latencyEl.textContent = latencyValue + 'ms';
            if (fpsEl) fpsEl.textContent = fpsValue;
            if (reqEl) reqEl.textContent = requestCount;

            const elapsed = Math.floor((Date.now() - startTime) / 1000);
            const mins = String(Math.floor(elapsed / 60)).padStart(2, '0');
            const secs = String(elapsed % 60).padStart(2, '0');
            if (uptimeEl) uptimeEl.textContent = mins + ':' + secs;
        }

        monitorInterval = setInterval(() => {
            measureLatency();
            updateDisplay();
        }, 2000);

        requestAnimationFrame(countFPS);

        updateDisplay();

        privateLog.addLog('性能监控已启动');
    }

    function stopMonitor() {
        isMonitoring = false;
        if (monitorInterval) {
            clearInterval(monitorInterval);
            monitorInterval = null;
        }
        if (monitorPanel) {
            monitorPanel.remove();
            monitorPanel = null;
        }
        privateLog.addLog('性能监控已停止');
    }

    function toggleMonitor(enable) {
        if (enable && !isMonitoring) {
            startMonitor();
        } else if (!enable && isMonitoring) {
            stopMonitor();
        }
        featureSettings.performanceMonitor = enable;
        saveSettings();
    }

    // ==================== 创建附加功能面板 ====================

    function createToggleItem(label, desc, value, onChange) {
        const item = document.createElement('div');
        item.style.cssText = `
            display: flex;
            justify-content: space-between;
            align-items: center;
            padding: 10px 12px;
            background: rgba(255,255,255,0.03);
            border-radius: 8px;
            border-left: 3px solid ${value ? '#50fa7b' : '#6272a4'};
        `;

        const info = document.createElement('div');
        info.style.cssText = `display:flex;flex-direction:column;gap:2px;`;
        const labelEl = document.createElement('span');
        labelEl.style.cssText = `color:#f8f8f2;font-size:14px;font-weight:500;`;
        labelEl.textContent = label;
        const descEl = document.createElement('span');
        descEl.style.cssText = `color:#6272a4;font-size:11px;`;
        descEl.textContent = desc;
        info.appendChild(labelEl);
        info.appendChild(descEl);

        const toggle = document.createElement('button');
        toggle.textContent = value ? '🟢 已开启' : '⚪ 已关闭';
        toggle.style.cssText = `
            padding: 4px 14px;
            border-radius: 6px;
            border: 1px solid ${value ? 'rgba(80,250,123,0.4)' : 'rgba(255,255,255,0.1)'};
            background: ${value ? 'rgba(80,250,123,0.15)' : 'rgba(255,255,255,0.05)'};
            color: ${value ? '#50fa7b' : '#6272a4'};
            cursor: pointer;
            font-size: 12px;
            transition: all 0.2s;
            flex-shrink: 0;
        `;
        toggle.onmouseover = () => { toggle.style.opacity = '0.8'; };
        toggle.onmouseout = () => { toggle.style.opacity = '1'; };
        toggle.onclick = function() {
            const newValue = !value;
            value = newValue;
            this.textContent = newValue ? '🟢 已开启' : '⚪ 已关闭';
            this.style.borderColor = newValue ? 'rgba(80,250,123,0.4)' : 'rgba(255,255,255,0.1)';
            this.style.background = newValue ? 'rgba(80,250,123,0.15)' : 'rgba(255,255,255,0.05)';
            this.style.color = newValue ? '#50fa7b' : '#6272a4';
            item.style.borderLeftColor = newValue ? '#50fa7b' : '#6272a4';
            onChange(newValue);
        };

        item.appendChild(info);
        item.appendChild(toggle);
        return item;
    }

    // ==================== 插件管理模块 ====================

    function createPluginManager() {
        const container = document.createElement('div');
        container.style.cssText = `margin-top: 12px;`;

        const title = document.createElement('div');
        title.style.cssText = `
            color: #8be9fd;
            font-weight: 500;
            font-size: 13px;
            margin-bottom: 8px;
        `;
        title.textContent = '🔌 插件管理';
        container.appendChild(title);

        const builtInLabel = document.createElement('div');
        builtInLabel.style.cssText = `
            color: #6272a4;
            font-size: 11px;
            margin-bottom: 6px;
        `;
        builtInLabel.textContent = '📌 内置研究插件';
        container.appendChild(builtInLabel);

        const builtInPlugins = [
            { name: '🔍 页面分析', desc: '分析页面结构、组件和事件监听' },
            { name: '📊 网络监控', desc: '监控和记录所有网络请求' },
            { name: '🛡️ 安全扫描', desc: '检测常见安全漏洞和配置问题' },
            { name: '📝 操作审计', desc: '记录用户操作行为用于安全审计' }
        ];

        builtInPlugins.forEach(plugin => {
            const item = document.createElement('div');
            item.style.cssText = `
                display: flex;
                justify-content: space-between;
                align-items: center;
                padding: 6px 10px;
                background: rgba(255,255,255,0.02);
                border-radius: 4px;
                margin-bottom: 4px;
                font-size: 12px;
            `;

            const info = document.createElement('div');
            info.style.cssText = `display:flex;flex-direction:column;gap:1px;`;
            const nameSpan = document.createElement('span');
            nameSpan.style.cssText = `color:#f8f8f2;`;
            nameSpan.textContent = plugin.name;
            const descSpan = document.createElement('span');
            descSpan.style.cssText = `color:#6272a4;font-size:10px;`;
            descSpan.textContent = plugin.desc;
            info.appendChild(nameSpan);
            info.appendChild(descSpan);

            const loadBtn = document.createElement('button');
            loadBtn.textContent = '加载';
            loadBtn.style.cssText = `
                padding: 2px 12px;
                background: rgba(102,126,234,0.2);
                border: 1px solid rgba(102,126,234,0.3);
                border-radius: 4px;
                color: #8be9fd;
                cursor: pointer;
                font-size: 10px;
                transition: all 0.2s;
                flex-shrink: 0;
            `;
            loadBtn.onmouseover = () => loadBtn.style.background = 'rgba(102,126,234,0.4)';
            loadBtn.onmouseout = () => loadBtn.style.background = 'rgba(102,126,234,0.2)';
            loadBtn.onclick = function() {
                showToast(`🔌 插件 "${plugin.name}" 已加载（研究模式）`);
                this.textContent = '✅ 已加载';
                this.style.background = 'rgba(80,250,123,0.2)';
                this.style.borderColor = 'rgba(80,250,123,0.3)';
                this.style.color = '#50fa7b';
                this.disabled = true;
            };

            item.appendChild(info);
            item.appendChild(loadBtn);
            container.appendChild(item);
        });

        const customLabel = document.createElement('div');
        customLabel.style.cssText = `
            color: #6272a4;
            font-size: 11px;
            margin: 8px 0 6px 0;
            border-top: 1px solid rgba(255,255,255,0.05);
            padding-top: 8px;
        `;
        customLabel.textContent = '🔗 自定义插件';
        container.appendChild(customLabel);

        const customRow = document.createElement('div');
        customRow.style.cssText = `
            display: flex;
            gap: 6px;
            align-items: center;
        `;

        const customInput = document.createElement('input');
        customInput.type = 'text';
        customInput.placeholder = '输入插件 URL (.js)';
        customInput.style.cssText = `
            flex: 1;
            padding: 4px 8px;
            background: rgba(0,0,0,0.3);
            border: 1px solid rgba(255,255,255,0.1);
            border-radius: 4px;
            color: #f8f8f2;
            font-size: 12px;
        `;
        customRow.appendChild(customInput);

        const customBtn = document.createElement('button');
        customBtn.textContent = '➕ 加载';
        customBtn.style.cssText = `
            padding: 4px 12px;
            background: rgba(80,250,123,0.15);
            border: 1px solid rgba(80,250,123,0.3);
            border-radius: 4px;
            color: #50fa7b;
            cursor: pointer;
            font-size: 11px;
            transition: all 0.2s;
            flex-shrink: 0;
        `;
        customBtn.onmouseover = () => customBtn.style.background = 'rgba(80,250,123,0.3)';
        customBtn.onmouseout = () => customBtn.style.background = 'rgba(80,250,123,0.15)';
        customBtn.onclick = function() {
            const url = customInput.value.trim();
            if (!url) {
                alert('请输入插件 URL');
                return;
            }
            if (!url.endsWith('.js')) {
                alert('请输入以 .js 结尾的 URL');
                return;
            }
            showToast(`🔌 正在加载自定义插件: ${url}`);
            this.textContent = '⏳ 加载中...';
            this.disabled = true;

            GM_xmlhttpRequest({
                method: 'GET',
                url: url,
                onload: function(response) {
                    try {
                        const fn = new Function(response.responseText);
                        const plugin = fn();
                        showToast(`✅ 插件加载成功: ${url}`);
                        customBtn.textContent = '✅ 已加载';
                        customBtn.style.background = 'rgba(80,250,123,0.3)';
                        customBtn.style.borderColor = 'rgba(80,250,123,0.5)';
                        customBtn.style.color = '#50fa7b';
                        customBtn.disabled = true;
                    } catch (e) {
                        showToast(`❌ 插件加载失败: ${e.message}`);
                        customBtn.textContent = '➕ 加载';
                        customBtn.disabled = false;
                    }
                },
                onerror: function(err) {
                    showToast(`❌ 网络请求失败: ${err.error}`);
                    customBtn.textContent = '➕ 加载';
                    customBtn.disabled = false;
                }
            });
        };

        customRow.appendChild(customBtn);
        container.appendChild(customRow);

        return container;
    }

    // ==================== 创建附加功能面板 ====================

    function createFeaturesPanel() {
        const container = document.createElement('div');
        container.style.cssText = `display:flex;flex-direction:column;gap:12px;`;

        const title = document.createElement('div');
        title.style.cssText = `
            color: #8be9fd;
            font-weight: 600;
            font-size: 16px;
            margin-bottom: 4px;
        `;
        title.textContent = '🔧 附加功能';
        container.appendChild(title);

        const desc = document.createElement('div');
        desc.style.cssText = `
            color: #6272a4;
            font-size: 12px;
            margin-bottom: 8px;
        `;
        desc.textContent = '开启/关闭附加功能，设置自动保存';
        container.appendChild(desc);

        container.appendChild(createToggleItem(
            '🚫 无视黑名单',
            '绕过黑名单检测，显示为未屏蔽状态',
            featureSettings.bypassBlacklist,
            (value) => {
                featureSettings.bypassBlacklist = value;
                saveSettings();
                showToast(`无视黑名单: ${value ? '已开启' : '已关闭'}`);
                if (value) {
                    if (confirm('此功能需要刷新页面才能生效，是否立即刷新？')) {
                        location.reload();
                    }
                }
            }
        ));

        container.appendChild(createToggleItem(
            '🔇 屏蔽协作记录',
            '屏蔽协作中的修改、进入、退出通知',
            featureSettings.blockCollaboration,
            (value) => {
                featureSettings.blockCollaboration = value;
                saveSettings();
                showToast(`屏蔽协作记录: ${value ? '已开启' : '已关闭'}`);
                if (value) {
                    if (confirm('此功能需要刷新页面才能生效，是否立即刷新？')) {
                        location.reload();
                    }
                }
            }
        ));

        container.appendChild(createToggleItem(
            '📊 性能监控',
            '实时显示网络延迟、FPS、请求数',
            featureSettings.performanceMonitor,
            (value) => {
                toggleMonitor(value);
            }
        ));

        // ====== 伪装手机号 ======
        container.appendChild(createToggleItem(
            '📱 伪装手机号',
            '伪装认证等级、手机号、信誉、QQ',
            featureSettings.fakePhone,
            (value) => {
                featureSettings.fakePhone = value;
                saveSettings();
                showToast(`伪装手机号: ${value ? '已开启' : '已关闭'}`);
                if (value) {
                    if (confirm('此功能需要刷新页面才能生效，是否立即刷新？')) {
                        location.reload();
                    }
                }
            }
        ));

        const divider = document.createElement('div');
        divider.style.cssText = `border-top: 1px solid rgba(255,255,255,0.05); margin: 4px 0;`;
        container.appendChild(divider);

        // 伪装身份
        const identity = GM_getValue('csrt_fake_identity');
        const fakeItem = document.createElement('div');
        fakeItem.style.cssText = `
            display: flex;
            flex-direction: column;
            gap: 6px;
            padding: 10px 12px;
            background: rgba(255,255,255,0.03);
            border-radius: 8px;
            border-left: 3px solid ${identity ? '#50fa7b' : '#6272a4'};
        `;

        const fakeHeader = document.createElement('div');
        fakeHeader.style.cssText = `display: flex; justify-content: space-between; align-items: center;`;

        const fakeInfo = document.createElement('div');
        fakeInfo.style.cssText = `display:flex;flex-direction:column;gap:2px;`;
        const fakeLabel = document.createElement('span');
        fakeLabel.style.cssText = `color:#f8f8f2;font-size:14px;font-weight:500;`;
        fakeLabel.textContent = '🎭 伪装身份';
        const fakeDesc = document.createElement('span');
        fakeDesc.style.cssText = `color:#6272a4;font-size:11px;`;
        fakeDesc.textContent = identity ? `当前伪装: ${identity.name || identity.id}` : '未开启伪装';
        fakeInfo.appendChild(fakeLabel);
        fakeInfo.appendChild(fakeDesc);

        const fakeBtn = document.createElement('button');
        fakeBtn.textContent = identity ? '🔄 修改' : '📝 设置';
        fakeBtn.style.cssText = `
            padding: 4px 14px;
            border-radius: 6px;
            border: 1px solid rgba(139,233,253,0.4);
            background: rgba(139,233,253,0.15);
            color: #8be9fd;
            cursor: pointer;
            font-size: 12px;
            transition: all 0.2s;
            flex-shrink: 0;
        `;
        fakeBtn.onmouseover = () => { fakeBtn.style.opacity = '0.8'; };
        fakeBtn.onmouseout = () => { fakeBtn.style.opacity = '1'; };
        fakeBtn.onclick = async function() {
            try {
                const currentIdentity = GM_getValue('csrt_fake_identity');
                const oid = prompt('输入目标用户的oid（主页链接后面的部分）', currentIdentity?.oid || '');
                if (oid === null) return;

                if (!oid) {
                    GM_deleteValue('csrt_fake_identity');
                    if (confirm('已清除伪装身份，是否刷新页面？')) {
                        location.reload();
                    }
                    return;
                }

                const info = await fetch('https://community-web.ccw.site/students/profile', {
                    headers: { 'content-type': 'application/json' },
                    referrer: 'https://www.ccw.site/',
                    method: 'POST',
                    body: JSON.stringify({ studentOid: oid })
                }).then(r => r.json());

                let id = prompt('输入要伪装的id', currentIdentity?.id || '');
                if (id === null) return;
                let name = prompt('输入要伪装的名字', currentIdentity?.name || '');
                if (name === null) return;
                let avatar = prompt('输入要伪装的头像url', currentIdentity?.avatar || '');
                if (avatar === null) return;

                if (!id && info.body?.studentNumber) id = info.body.studentNumber;
                if (!name && info.body?.name) name = info.body.name;
                if (!avatar && info.body?.avatar) avatar = info.body.avatar;

                if (id && name && avatar) {
                    GM_setValue('csrt_fake_identity', { oid, id, name, avatar });
                    alert('✅ 伪装身份已保存，刷新页面生效！');
                    location.reload();
                } else {
                    alert('❌ 信息不完整，请重试');
                }
            } catch (e) {
                alert('❌ 设置失败: ' + e.message);
            }
        };

        const clearFakeBtn = document.createElement('button');
        clearFakeBtn.textContent = '🗑️ 清除';
        clearFakeBtn.style.cssText = `
            padding: 4px 12px;
            border-radius: 6px;
            border: 1px solid rgba(255,85,85,0.3);
            background: rgba(255,85,85,0.1);
            color: #ff5555;
            cursor: pointer;
            font-size: 12px;
            transition: all 0.2s;
            flex-shrink: 0;
        `;
        clearFakeBtn.onmouseover = () => { clearFakeBtn.style.opacity = '0.8'; };
        clearFakeBtn.onmouseout = () => { clearFakeBtn.style.opacity = '1'; };
        clearFakeBtn.onclick = function() {
            if (confirm('确定要清除伪装身份吗？')) {
                GM_deleteValue('csrt_fake_identity');
                alert('✅ 已清除，刷新页面生效。');
                location.reload();
            }
        };

        const fakeBtns = document.createElement('div');
        fakeBtns.style.cssText = `display:flex;gap:8px;`;
        fakeBtns.appendChild(fakeBtn);
        if (identity) fakeBtns.appendChild(clearFakeBtn);

        fakeHeader.appendChild(fakeInfo);
        fakeHeader.appendChild(fakeBtns);
        fakeItem.appendChild(fakeHeader);
        container.appendChild(fakeItem);

        // 作品替换器
        const hasReplacerData = GM_getValue('csrt_project_replacer_meta') !== undefined;
        const replacerItem = document.createElement('div');
        replacerItem.style.cssText = `
            display: flex;
            flex-direction: column;
            gap: 6px;
            padding: 10px 12px;
            background: rgba(255,255,255,0.03);
            border-radius: 8px;
            border-left: 3px solid ${hasReplacerData ? '#50fa7b' : '#6272a4'};
        `;

        const replacerHeader = document.createElement('div');
        replacerHeader.style.cssText = `display: flex; justify-content: space-between; align-items: center;`;

        const replacerInfo = document.createElement('div');
        replacerInfo.style.cssText = `display:flex;flex-direction:column;gap:2px;`;
        const replacerLabel = document.createElement('span');
        replacerLabel.style.cssText = `color:#f8f8f2;font-size:14px;font-weight:500;`;
        replacerLabel.textContent = '📦 作品替换器';
        const replacerDesc = document.createElement('span');
        replacerDesc.style.cssText = `color:#6272a4;font-size:11px;`;
        replacerDesc.textContent = hasReplacerData ? '✅ 已替换，刷新页面生效' : '访问他人作品时替换为本地文件';
        replacerInfo.appendChild(replacerLabel);
        replacerInfo.appendChild(replacerDesc);

        const replacerBtn = document.createElement('button');
        replacerBtn.textContent = hasReplacerData ? '🗑️ 清除替换' : '📂 选择文件';
        replacerBtn.style.cssText = `
            padding: 4px 14px;
            border-radius: 6px;
            border: 1px solid ${hasReplacerData ? 'rgba(255,85,85,0.4)' : 'rgba(80,250,123,0.4)'};
            background: ${hasReplacerData ? 'rgba(255,85,85,0.15)' : 'rgba(80,250,123,0.15)'};
            color: ${hasReplacerData ? '#ff5555' : '#50fa7b'};
            cursor: pointer;
            font-size: 12px;
            transition: all 0.2s;
            flex-shrink: 0;
        `;
        replacerBtn.onmouseover = () => { replacerBtn.style.opacity = '0.8'; };
        replacerBtn.onmouseout = () => { replacerBtn.style.opacity = '1'; };
        replacerBtn.onclick = async function() {
            if (hasReplacerData) {
                if (confirm('确定要清除替换文件吗？')) {
                    GM_deleteValue('csrt_project_replacer_meta');
                    const count = GM_getValue('csrt_project_replacer_chunk_count', 0);
                    for (let i = 0; i < count; i++) {
                        GM_deleteValue('csrt_project_replacer_chunk_' + i);
                    }
                    GM_deleteValue('csrt_project_replacer_chunk_count');
                    alert('✅ 已清除，刷新页面生效。');
                    location.reload();
                }
                return;
            }

            const file = await showFilePrompt('.sb3,.sb2,.zip', '上传sb3文件');
            if (!file) return;

            try {
                const reader = new FileReader();
                await new Promise((resolve, reject) => {
                    reader.onload = function(e) {
                        try {
                            const base64 = e.target.result.split(',')[1];
                            const chunkSize = 102400;
                            const chunks = [];
                            for (let i = 0; i < base64.length; i += chunkSize) {
                                chunks.push(base64.slice(i, i + chunkSize));
                            }
                            GM_setValue('csrt_project_replacer_meta', {
                                totalChunks: chunks.length,
                                size: file.size,
                                type: file.type
                            });
                            chunks.forEach((chunk, index) => {
                                GM_setValue('csrt_project_replacer_chunk_' + index, chunk);
                            });
                            GM_setValue('csrt_project_replacer_chunk_count', chunks.length);
                            resolve();
                        } catch (e) {
                            reject(e);
                        }
                    };
                    reader.onerror = reject;
                    reader.readAsDataURL(file);
                });
                alert('✅ 作品替换文件已保存！刷新页面生效。');
                location.reload();
            } catch (e) {
                alert('❌ 保存失败: ' + e.message);
            }
        };

        replacerHeader.appendChild(replacerInfo);
        replacerHeader.appendChild(replacerBtn);
        replacerItem.appendChild(replacerHeader);
        container.appendChild(replacerItem);

        // 角色插入器
        const inserterItem = document.createElement('div');
        inserterItem.style.cssText = `
            display: flex;
            flex-direction: column;
            gap: 6px;
            padding: 10px 12px;
            background: rgba(255,255,255,0.03);
            border-radius: 8px;
            border-left: 3px solid #8be9fd;
        `;

        const inserterHeader = document.createElement('div');
        inserterHeader.style.cssText = `display: flex; justify-content: space-between; align-items: center;`;

        const inserterInfo = document.createElement('div');
        inserterInfo.style.cssText = `display:flex;flex-direction:column;gap:2px;`;
        const inserterLabel = document.createElement('span');
        inserterLabel.style.cssText = `color:#f8f8f2;font-size:14px;font-weight:500;`;
        inserterLabel.textContent = '🧩 角色插入器';
        const inserterDesc = document.createElement('span');
        inserterDesc.style.cssText = `color:#6272a4;font-size:11px;`;
        inserterDesc.textContent = '向当前作品插入本地角色文件 (.sprite3)';
        inserterInfo.appendChild(inserterLabel);
        inserterInfo.appendChild(inserterDesc);

        const inserterBtn = document.createElement('button');
        inserterBtn.textContent = '📂 选择角色文件';
        inserterBtn.style.cssText = `
            padding: 4px 14px;
            border-radius: 6px;
            border: 1px solid rgba(139,233,253,0.4);
            background: rgba(139,233,253,0.15);
            color: #8be9fd;
            cursor: pointer;
            font-size: 12px;
            transition: all 0.2s;
            flex-shrink: 0;
        `;
        inserterBtn.onmouseover = () => { inserterBtn.style.opacity = '0.8'; };
        inserterBtn.onmouseout = () => { inserterBtn.style.opacity = '1'; };
        inserterBtn.onclick = async function() {
            try {
                const vm = await getVM();
                if (!vm) {
                    alert('❌ 无法获取VM实例，请确保在作品页面使用');
                    return;
                }

                const file = await showFilePrompt('.sprite3,.sprite2,.zip', '上传角色文件');
                if (!file) return;

                await vm.addSprite(await blobToArrayBuffer(file));
                alert('✅ 角色插入成功！');
            } catch (e) {
                alert('❌ 错误: ' + e.message);
            }
        };

        inserterHeader.appendChild(inserterInfo);
        inserterHeader.appendChild(inserterBtn);
        inserterItem.appendChild(inserterHeader);
        container.appendChild(inserterItem);

        // ====== 插件管理 ======
        const pluginManager = createPluginManager();
        container.appendChild(pluginManager);

        // 底部提示
        const footer = document.createElement('div');
        footer.style.cssText = `
            margin-top: 8px;
            padding: 8px 12px;
            background: rgba(255,255,255,0.03);
            border-radius: 6px;
            font-size: 11px;
            color: #6272a4;
        `;
        footer.textContent = '💡 设置保存在本地 | 部分功能需要刷新页面生效 | 油猴菜单也可操作';
        container.appendChild(footer);

        return container;
    }

    // ==================== 经济合约管理模块 ====================

    async function loadEconomyContracts(container) {
        try {
            const vm = await getVM();
            if (!vm) {
                container.innerHTML = '<div style="color:#ff5555;padding:8px;">❌ 无法获取VM实例</div>';
                return;
            }

            let economyExt = null;
            if (vm.extensionManager) {
                const loadedExts = vm.extensionManager._loadedExtensions || {};
                for (const name of Object.keys(loadedExts)) {
                    if (name.toLowerCase().includes('gandieconomy')) {
                        economyExt = loadedExts[name];
                        break;
                    }
                }
                if (!economyExt && vm.extensionManager._gandiExternalExtensionServices) {
                    for (const name of Object.keys(vm.extensionManager._gandiExternalExtensionServices)) {
                        if (name.toLowerCase().includes('gandieconomy')) {
                            economyExt = vm.extensionManager._gandiExternalExtensionServices[name];
                            break;
                        }
                    }
                }
            }

            if (!economyExt) {
                container.innerHTML = '<div style="color:#6272a4;padding:8px;">经济合约扩展未加载</div>';
                return;
            }

            const contractList = await economyExt.getSmartContractList?.() || [];
            if (contractList.length === 0) {
                container.innerHTML = '<div style="color:#6272a4;padding:8px;">暂无经济合约</div>';
                return;
            }

            let html = `
                <div style="font-size:12px;max-height:300px;overflow-y:auto;">
            `;

            for (const contract of contractList) {
                const balance = await economyExt.getSmartContractAccountByContractId?.(contract.id) || 0;
                const status = contract.status === 'ENABLED' ? '✅ 已启用' : '⛔ 已禁用';
                const typeMap = {
                    'DUCK_MAKER': '鸭里奥制造',
                    'GENERAL': '通用',
                    'GENERAL_NO_SPLIT': '通用(无分成)'
                };
                const typeName = typeMap[contract.type] || contract.type || '未知';

                html += `
                    <div style="background:rgba(255,255,255,0.03);border-radius:6px;padding:8px;margin-bottom:8px;border-left:3px solid ${contract.status === 'ENABLED' ? '#50fa7b' : '#ff5555'};">
                        <div style="display:flex;justify-content:space-between;align-items:center;">
                            <span style="color:#f8f8f2;font-weight:500;">${contract.title || '未命名合约'}</span>
                            <span style="color:#6272a4;font-size:11px;">${status}</span>
                        </div>
                        <div style="color:#6272a4;font-size:11px;margin-top:2px;">
                            类型: ${typeName} | 余额: ${balance} 金币
                        </div>
                        <div style="color:#6272a4;font-size:10px;margin-top:2px;word-break:break-all;">
                            ID: ${contract.id}
                        </div>
                        <div style="margin-top:6px;display:flex;gap:6px;flex-wrap:wrap;">
                            <button class="srt-view-contract" data-id="${contract.id}" style="padding:2px 10px;background:rgba(241,250,140,0.15);border:1px solid rgba(241,250,140,0.3);border-radius:4px;color:#f1fa8c;cursor:pointer;font-size:10px;">
                                📋 查看规则
                            </button>
                            <button class="srt-execute-contract" data-id="${contract.id}" style="padding:2px 10px;background:rgba(102,126,234,0.2);border:1px solid rgba(102,126,234,0.3);border-radius:4px;color:#8be9fd;cursor:pointer;font-size:10px;">
                                ▶ 执行规则
                            </button>
                        </div>
                    </div>
                `;
            }

            html += `</div>`;
            container.innerHTML = html;

            container.querySelectorAll('.srt-view-contract').forEach(btn => {
                btn.onclick = function() {
                    const id = this.dataset.id;
                    showContractRules(id, economyExt);
                };
            });

            container.querySelectorAll('.srt-execute-contract').forEach(btn => {
                btn.onclick = function() {
                    const id = this.dataset.id;
                    executeContractRule(id, economyExt);
                };
            });

        } catch (e) {
            container.innerHTML = `<div style="color:#ff5555;padding:8px;">❌ 加载失败: ${e.message}</div>`;
            privateLog.addError('加载经济合约失败: ' + e.message);
        }
    }

    async function showContractRules(contractId, economyExt) {
        try {
            const contract = await economyExt.getSmartContract?.(contractId);
            if (!contract) {
                alert('无法获取合约详情');
                return;
            }

            const overlay = document.createElement('div');
            overlay.style.cssText = `
                position: fixed; top:0; left:0; right:0; bottom:0;
                background: rgba(0,0,0,0.8); z-index:1000003;
                display:flex; align-items:center; justify-content:center;
                backdrop-filter:blur(4px);
            `;

            const dialog = document.createElement('div');
            dialog.style.cssText = `
                background:#1a1a2e; border-radius:16px; padding:24px;
                width:85%; max-width:700px; max-height:85vh;
                border:2px solid #f1fa8c; box-shadow:0 20px 60px rgba(0,0,0,0.9);
                color:#eee; display:flex; flex-direction:column; overflow:hidden;
            `;

            const header = document.createElement('div');
            header.style.cssText = `
                display:flex; justify-content:space-between; align-items:center;
                padding-bottom:12px; border-bottom:1px solid rgba(255,255,255,0.1);
                flex-shrink:0;
            `;

            const title = document.createElement('span');
            title.style.cssText = `font-size:18px;font-weight:600;color:#f1fa8c;`;
            title.textContent = `📋 合约规则: ${contract.title || '未命名'}`;

            const closeBtn = document.createElement('button');
            closeBtn.textContent = '✕';
            closeBtn.style.cssText = `
                background:none; border:none; color:#6272a4; font-size:22px;
                cursor:pointer; padding:0 8px;
            `;
            closeBtn.onclick = () => overlay.remove();

            header.appendChild(title);
            header.appendChild(closeBtn);
            dialog.appendChild(header);

            let rulesHtml = `
                <div style="margin:12px 0;font-size:13px;line-height:1.8;overflow-y:auto;flex:1;">
                    <div style="color:#6272a4;font-size:12px;">合约ID: ${contract.id}</div>
                    <div style="color:#6272a4;font-size:12px;">类型: ${contract.type}</div>
                    <div style="color:#6272a4;font-size:12px;">状态: ${contract.status === 'ENABLED' ? '✅ 已启用' : '⛔ 已禁用'}</div>
            `;

            if (contract.rules && contract.rules.length > 0) {
                rulesHtml += `<div style="margin-top:12px;color:#f1fa8c;font-weight:500;">📌 规则列表</div>`;
                contract.rules.forEach((rule, index) => {
                    const code = rule.rule?.code || rule.code || '无代码';
                    const signature = rule.rule?.funSignature?.zh_cn || rule.funSignature?.zh_cn || '无描述';
                    rulesHtml += `
                        <div style="background:rgba(255,255,255,0.03);border-radius:6px;padding:8px;margin-top:6px;border-left:2px solid #f1fa8c;">
                            <div style="color:#f8f8f2;font-weight:500;">规则${index + 1}: ${rule.rule?.title || rule.title || '未命名'}</div>
                            <div style="color:#6272a4;font-size:11px;">${signature}</div>
                            <details style="margin-top:4px;">
                                <summary style="color:#8be9fd;cursor:pointer;font-size:11px;">查看代码</summary>
                                <pre style="background:rgba(0,0,0,0.3);padding:8px;border-radius:4px;font-size:11px;font-family:monospace;color:#f8f8f2;white-space:pre-wrap;word-break:break-all;margin-top:4px;max-height:200px;overflow-y:auto;">${code}</pre>
                            </details>
                        </div>
                    `;
                });
            } else {
                rulesHtml += `<div style="color:#6272a4;margin-top:12px;">该合约暂无规则</div>`;
            }

            rulesHtml += `</div>`;
            dialog.innerHTML = '';
            dialog.appendChild(header);
            dialog.insertAdjacentHTML('beforeend', rulesHtml);

            const footer = document.createElement('div');
            footer.style.cssText = `
                display:flex; gap:12px; justify-content:flex-end;
                flex-shrink:0; padding-top:12px; border-top:1px solid rgba(255,255,255,0.1);
            `;

            const closeFooterBtn = document.createElement('button');
            closeFooterBtn.textContent = '关闭';
            closeFooterBtn.style.cssText = `
                padding:8px 20px; background:rgba(255,255,255,0.05);
                border:1px solid rgba(255,255,255,0.1); border-radius:8px;
                color:#6272a4; cursor:pointer; font-size:14px;
            `;
            closeFooterBtn.onclick = () => overlay.remove();
            footer.appendChild(closeFooterBtn);
            dialog.appendChild(footer);

            overlay.appendChild(dialog);
            document.body.appendChild(overlay);
        } catch (e) {
            alert('❌ 获取合约详情失败: ' + e.message);
        }
    }

    async function executeContractRule(contractId, economyExt) {
        try {
            const contract = await economyExt.getSmartContract?.(contractId);
            if (!contract || !contract.rules || contract.rules.length === 0) {
                alert('该合约没有可执行的规则');
                return;
            }

            const ruleOptions = contract.rules.map((rule, index) =>
                `${index + 1}. ${rule.rule?.title || rule.title || '未命名'}`
            ).join('\n');

            const choice = prompt(`选择要执行的规则 (输入编号):\n${ruleOptions}`);
            if (!choice) return;

            const index = parseInt(choice) - 1;
            if (isNaN(index) || index < 0 || index >= contract.rules.length) {
                alert('无效的规则编号');
                return;
            }

            const rule = contract.rules[index];
            const code = rule.rule?.code || rule.code;

            const params = {};
            if (rule.rule?.funSignature?.params) {
                for (const param of rule.rule.funSignature.params) {
                    const value = prompt(`请输入参数 "${param}" 的值:`);
                    if (value === null) return;
                    params[param] = isNaN(value) ? value : Number(value);
                }
            }

            const result = await economyExt.requestExecuteSmartContract?.(
                contractId,
                rule.id || rule.rule?.id,
                code,
                params
            );

            alert(`✅ 执行完成\n结果: ${JSON.stringify(result, null, 2)}`);
        } catch (e) {
            alert('❌ 执行失败: ' + e.message);
        }
    }

    // ==================== 数据修改面板 ====================

    function createDataModifyPanel() {
        const container = document.createElement('div');
        container.style.cssText = `display:flex;flex-direction:column;gap:12px;`;

        let hasCCWData = false;
        let hasGandiEconomy = false;
        if (vmInstance) {
            hasCCWData = hasCCWDataExtension(vmInstance);
            hasGandiEconomy = hasGandiEconomyExtension(vmInstance);
        }

        const title = document.createElement('div');
        title.style.cssText = `
            color: #8be9fd;
            font-weight: 600;
            font-size: 16px;
            margin-bottom: 4px;
        `;
        title.textContent = '📝 数据修改';
        container.appendChild(title);

        // ==================== 变量管理 ====================

        const varSection = document.createElement('div');
        varSection.style.cssText = `
            background: rgba(255,255,255,0.03);
            border-radius: 8px;
            padding: 12px;
        `;

        const varTitle = document.createElement('div');
        varTitle.style.cssText = `
            color: #f8f8f2;
            font-weight: 500;
            font-size: 14px;
            margin-bottom: 8px;
        `;
        varTitle.textContent = '🎯 变量管理';
        varSection.appendChild(varTitle);

        const selectorRow = document.createElement('div');
        selectorRow.style.cssText = `
            display: flex;
            gap: 8px;
            align-items: center;
            flex-wrap: wrap;
            margin-bottom: 8px;
        `;

        const spriteSelect = document.createElement('select');
        spriteSelect.style.cssText = `
            padding: 4px 8px;
            background: rgba(0,0,0,0.3);
            border: 1px solid rgba(255,255,255,0.1);
            border-radius: 4px;
            color: #f8f8f2;
            font-size: 12px;
        `;
        spriteSelect.innerHTML = `<option value="stage">舞台</option>`;
        selectorRow.appendChild(spriteSelect);

        const cloneInput = document.createElement('input');
        cloneInput.type = 'number';
        cloneInput.min = 1;
        cloneInput.value = 1;
        cloneInput.style.cssText = `
            width: 50px;
            padding: 4px 8px;
            background: rgba(0,0,0,0.3);
            border: 1px solid rgba(255,255,255,0.1);
            border-radius: 4px;
            color: #f8f8f2;
            font-size: 12px;
        `;
        selectorRow.appendChild(cloneInput);

        const totalLabel = document.createElement('span');
        totalLabel.style.cssText = `color:#6272a4;font-size:12px;`;
        totalLabel.textContent = '/ 1';
        selectorRow.appendChild(totalLabel);

        const searchInput = document.createElement('input');
        searchInput.type = 'text';
        searchInput.placeholder = '🔍 搜索变量...';
        searchInput.style.cssText = `
            flex: 1;
            padding: 4px 8px;
            min-width: 100px;
            background: rgba(0,0,0,0.3);
            border: 1px solid rgba(255,255,255,0.1);
            border-radius: 4px;
            color: #f8f8f2;
            font-size: 12px;
        `;
        selectorRow.appendChild(searchInput);

        varSection.appendChild(selectorRow);

        const varList = document.createElement('div');
        varList.style.cssText = `
            max-height: 300px;
            overflow-y: auto;
            font-size: 12px;
        `;
        varList.innerHTML = '<div style="color:#6272a4;padding:8px;">加载中...</div>';
        varSection.appendChild(varList);

        container.appendChild(varSection);

        // ==================== 云数据管理 ====================

        if (hasCCWData) {
            const cloudSection = document.createElement('div');
            cloudSection.style.cssText = `
                background: rgba(255,255,255,0.03);
                border-radius: 8px;
                padding: 12px;
                border-left: 3px solid #ffb86c;
            `;

            const cloudTitle = document.createElement('div');
            cloudTitle.style.cssText = `
                color: #ffb86c;
                font-weight: 500;
                font-size: 14px;
                margin-bottom: 8px;
                display: flex;
                justify-content: space-between;
                align-items: center;
            `;
            cloudTitle.innerHTML = `☁️ CCWData云数据管理 <span style="font-size:11px;color:#50fa7b;">✅ 已检测到</span>`;
            cloudSection.appendChild(cloudTitle);

            const cloudTabs = document.createElement('div');
            cloudTabs.style.cssText = `
                display: flex;
                gap: 4px;
                margin-bottom: 8px;
            `;

            let activeCloudTab = 'project';
            const cloudContents = {};

            const cloudTabData = [
                { id: 'project', label: '📁 作品数据' },
                { id: 'user', label: '👤 用户数据' }
            ];

            cloudTabData.forEach(tab => {
                const btn = document.createElement('button');
                btn.textContent = tab.label;
                btn.style.cssText = `
                    padding: 4px 12px;
                    background: ${activeCloudTab === tab.id ? 'rgba(255,184,108,0.2)' : 'transparent'};
                    border: 1px solid ${activeCloudTab === tab.id ? 'rgba(255,184,108,0.3)' : 'transparent'};
                    border-radius: 4px;
                    color: ${activeCloudTab === tab.id ? '#ffb86c' : '#6272a4'};
                    cursor: pointer;
                    font-size: 11px;
                    transition: all 0.2s;
                `;
                btn.onclick = () => {
                    activeCloudTab = tab.id;
                    document.querySelectorAll('.csrt-cloud-tab').forEach(b => {
                        b.style.background = b.dataset.tab === activeCloudTab ? 'rgba(255,184,108,0.2)' : 'transparent';
                        b.style.borderColor = b.dataset.tab === activeCloudTab ? 'rgba(255,184,108,0.3)' : 'transparent';
                        b.style.color = b.dataset.tab === activeCloudTab ? '#ffb86c' : '#6272a4';
                    });
                    Object.keys(cloudContents).forEach(key => {
                        cloudContents[key].style.display = key === activeCloudTab ? 'block' : 'none';
                    });
                };
                btn.dataset.tab = tab.id;
                btn.className = 'csrt-cloud-tab';
                cloudTabs.appendChild(btn);

                const content = document.createElement('div');
                content.style.cssText = `
                    padding: 4px 0;
                    font-size: 12px;
                    display: ${tab.id === 'project' ? 'block' : 'none'};
                `;
                content.innerHTML = '<div style="color:#6272a4;padding:8px;">加载云数据...</div>';
                cloudContents[tab.id] = content;
                cloudSection.appendChild(content);
            });

            cloudSection.appendChild(cloudTabs);
            container.appendChild(cloudSection);

            loadCloudData(cloudContents);
        }

        // ==================== 经济合约管理 ====================

        if (hasGandiEconomy) {
            const economySection = document.createElement('div');
            economySection.style.cssText = `
                background: rgba(255,255,255,0.03);
                border-radius: 8px;
                padding: 12px;
                border-left: 3px solid #f1fa8c;
            `;

            const economyTitle = document.createElement('div');
            economyTitle.style.cssText = `
                color: #f1fa8c;
                font-weight: 500;
                font-size: 14px;
                margin-bottom: 8px;
                display: flex;
                justify-content: space-between;
                align-items: center;
            `;
            economyTitle.innerHTML = `💰 经济合约管理 <span style="font-size:11px;color:#50fa7b;">✅ 已检测到</span>`;
            economySection.appendChild(economyTitle);

            const economyInfo = document.createElement('div');
            economyInfo.style.cssText = `
                color: #6272a4;
                font-size: 12px;
                padding: 8px;
                text-align: center;
            `;
            economyInfo.textContent = '⏳ 加载经济合约数据...';
            economySection.appendChild(economyInfo);
            container.appendChild(economySection);

            loadEconomyContracts(economyInfo);
        }

        // ==================== 下载项目源码 ====================

        const downloadSection = document.createElement('div');
        downloadSection.style.cssText = `
            background: rgba(255,255,255,0.03);
            border-radius: 8px;
            padding: 12px;
            border-left: 3px solid #8be9fd;
        `;

        const downloadHeader = document.createElement('div');
        downloadHeader.style.cssText = `
            display: flex;
            justify-content: space-between;
            align-items: center;
        `;

        const downloadInfo = document.createElement('div');
        downloadInfo.style.cssText = `display:flex;flex-direction:column;gap:2px;`;
        const downloadLabel = document.createElement('span');
        downloadLabel.style.cssText = `color:#f8f8f2;font-size:14px;font-weight:500;`;
        downloadLabel.textContent = '📥 下载项目源码';
        const downloadDesc = document.createElement('span');
        downloadDesc.style.cssText = `color:#6272a4;font-size:11px;`;
        downloadDesc.textContent = '下载当前作品的完整 .sb3 文件';
        downloadInfo.appendChild(downloadLabel);
        downloadInfo.appendChild(downloadDesc);

        const downloadBtn = document.createElement('button');
        downloadBtn.textContent = '⬇️ 下载';
        downloadBtn.style.cssText = `
            padding: 6px 20px;
            border-radius: 6px;
            border: 1px solid rgba(139,233,253,0.4);
            background: rgba(139,233,253,0.15);
            color: #8be9fd;
            cursor: pointer;
            font-size: 13px;
            font-weight: 500;
            transition: all 0.2s;
            flex-shrink: 0;
        `;
        downloadBtn.onmouseover = () => { downloadBtn.style.opacity = '0.8'; };
        downloadBtn.onmouseout = () => { downloadBtn.style.opacity = '1'; };
        downloadBtn.onclick = downloadProject;

        downloadHeader.appendChild(downloadInfo);
        downloadHeader.appendChild(downloadBtn);
        downloadSection.appendChild(downloadHeader);
        container.appendChild(downloadSection);

        loadVariableList(spriteSelect, cloneInput, totalLabel, varList, searchInput);

        return container;
    }

    // ==================== 加载变量列表 ====================

    let cachedVariables = [];
    let cachedTargets = [];
    let currentTargetId = null;
    let currentCloneIndex = 1;
    let isVarRendering = false;
    let refreshTimeout = null;
    const MAX_VISIBLE_ITEMS = 50;

    function loadVariableList(spriteSelect, cloneInput, totalLabel, varList, searchInput) {
        if (isVarRendering) return;

        getVM().then(vm => {
            if (!vm) {
                varList.innerHTML = '<div style="color:#ff5555;padding:8px;">❌ 无法获取VM实例</div>';
                return;
            }

            const runtime = vm.runtime;
            if (!runtime) {
                varList.innerHTML = '<div style="color:#ff5555;padding:8px;">❌ 无法获取Runtime</div>';
                return;
            }

            const targets = runtime.targets || [];
            cachedTargets = targets;

            const stageTarget = targets.find(t => t.isStage);
            const spriteTargets = targets.filter(t => !t.isStage && t.isOriginal);

            spriteSelect.innerHTML = '';
            const stageOption = document.createElement('option');
            stageOption.value = 'stage';
            stageOption.textContent = '🎭 舞台';
            spriteSelect.appendChild(stageOption);

            spriteTargets.forEach(t => {
                const option = document.createElement('option');
                option.value = t.id;
                option.textContent = t.sprite?.name || '未知角色';
                spriteSelect.appendChild(option);
            });

            let targetId = spriteSelect.value;
            let target = targets.find(t => t.id === targetId || (targetId === 'stage' && t.isStage));

            if (!target) {
                target = stageTarget;
                spriteSelect.value = 'stage';
            }

            const allClones = targets.filter(t => t.sprite?.name === target.sprite?.name);
            totalLabel.textContent = `/ ${allClones.length || 1}`;
            let cloneIndex = parseInt(cloneInput.value) || 1;
            cloneIndex = Math.max(1, Math.min(cloneIndex, allClones.length || 1));
            cloneInput.value = cloneIndex;

            if (allClones.length > 0) {
                target = allClones[cloneIndex - 1] || allClones[0];
            }

            const variables = target?.variables || {};
            const varNames = Object.keys(variables);
            const varItems = [];

            for (const id of varNames) {
                const v = variables[id];
                const isCloud = v.isCloud || false;
                const isList = v.type === 'list' || Array.isArray(v.value);
                let value = v.value;
                if (isList) {
                    try {
                        value = Array.isArray(value) ? JSON.stringify(value) : value;
                    } catch (e) {
                        value = String(value);
                    }
                }
                varItems.push({
                    id: id,
                    name: v.name || id,
                    value: value,
                    isCloud: isCloud,
                    isList: isList,
                    frozen: v._csrt_frozen || false
                });
            }

            cachedVariables = varItems;
            currentTargetId = targetId;

            renderVariableList(varItems, varList, searchInput?.value || '');

            if (!varList._eventsBound) {
                varList._eventsBound = true;

                varList.addEventListener('change', function(e) {
                    const input = e.target.closest('input[data-varid]');
                    if (!input) return;

                    const id = input.dataset.varid;
                    const varData = cachedVariables.find(v => v.id === id);
                    if (!varData) return;

                    let value = input.value;
                    if (varData.isList) {
                        try {
                            value = JSON.parse(value);
                        } catch (e) {
                            try {
                                value = value.split(',').map(s => s.trim());
                            } catch (e2) {
                                value = [];
                            }
                        }
                    }
                    updateVariable(id, value);
                    showToast(`✅ 已更新: ${varData.name}`);
                });

                varList.addEventListener('click', function(e) {
                    const btn = e.target.closest('button[data-varid]');
                    if (!btn) return;

                    const id = btn.dataset.varid;
                    const varData = cachedVariables.find(v => v.id === id);
                    if (!varData) return;

                    const frozen = btn.dataset.frozen === 'true';
                    const newFrozen = !frozen;
                    btn.dataset.frozen = String(newFrozen);
                    btn.textContent = newFrozen ? '🔓' : '🔒';
                    varData.frozen = newFrozen;
                    updateVariableFrozen(id, newFrozen);
                    showToast(`${newFrozen ? '🔒 已锁定' : '🔓 已解锁'}: ${varData.name}`);
                });
            }

            searchInput.removeEventListener('input', handleSearch);
            function handleSearch() {
                debouncedRender(cachedVariables, varList, this.value);
            }
            searchInput.addEventListener('input', handleSearch);

            spriteSelect.removeEventListener('change', handleSpriteChange);
            function handleSpriteChange() {
                const targetId = this.value;
                const newTarget = targets.find(t => t.id === targetId || (targetId === 'stage' && t.isStage));
                if (newTarget) {
                    const clones = targets.filter(t => t.sprite?.name === newTarget.sprite?.name);
                    totalLabel.textContent = `/ ${clones.length || 1}`;
                    cloneInput.value = 1;
                    loadVariableList(spriteSelect, cloneInput, totalLabel, varList, searchInput);
                }
            }
            spriteSelect.addEventListener('change', handleSpriteChange);

            cloneInput.removeEventListener('change', handleCloneChange);
            function handleCloneChange() {
                let index = parseInt(this.value) || 1;
                const targetId = spriteSelect.value;
                const baseTarget = targets.find(t => t.id === targetId || (targetId === 'stage' && t.isStage));
                if (baseTarget) {
                    const clones = targets.filter(t => t.sprite?.name === baseTarget.sprite?.name);
                    index = Math.max(1, Math.min(index, clones.length || 1));
                    this.value = index;
                    totalLabel.textContent = `/ ${clones.length || 1}`;
                    loadVariableList(spriteSelect, cloneInput, totalLabel, varList, searchInput);
                }
            }
            cloneInput.addEventListener('change', handleCloneChange);

        }).catch(e => {
            varList.innerHTML = `<div style="color:#ff5555;padding:8px;">❌ 加载失败: ${e.message}</div>`;
            privateLog.addError('加载变量列表失败: ' + e.message);
        });
    }

    function debouncedRender(variables, varList, filter) {
        if (refreshTimeout) {
            clearTimeout(refreshTimeout);
        }
        refreshTimeout = setTimeout(() => {
            renderVariableList(variables, varList, filter);
            refreshTimeout = null;
        }, 100);
    }

    function renderVariableList(variables, varList, filter = '') {
        if (isVarRendering) return;
        isVarRendering = true;

        requestAnimationFrame(() => {
            const fragment = document.createDocumentFragment();

            const filtered = variables.filter(item =>
                item.name.toLowerCase().includes(filter.toLowerCase())
            );

            if (filtered.length === 0) {
                const empty = document.createElement('div');
                empty.style.cssText = 'color:#6272a4;padding:8px;';
                empty.textContent = '无变量';
                fragment.appendChild(empty);
                varList.innerHTML = '';
                varList.appendChild(fragment);
                isVarRendering = false;
                return;
            }

            const displayItems = filtered.slice(0, MAX_VISIBLE_ITEMS);
            const hasMore = filtered.length > MAX_VISIBLE_ITEMS;

            const header = document.createElement('div');
            header.style.cssText = `
                display:grid;grid-template-columns:1fr 1fr auto;gap:4px 8px;
                padding:4px 0;border-bottom:1px solid rgba(255,255,255,0.05);
                color:#6272a4;font-size:11px;
            `;
            header.innerHTML = '<span>变量名</span><span>值</span><span>操作</span>';
            fragment.appendChild(header);

            displayItems.forEach(item => {
                const row = document.createElement('div');
                row.style.cssText = `
                    display:grid;grid-template-columns:1fr 1fr auto;gap:4px 8px;
                    padding:4px 0;border-bottom:1px solid rgba(255,255,255,0.03);
                    align-items:center;
                `;
                row.dataset.varid = item.id;

                const nameSpan = document.createElement('span');
                nameSpan.style.cssText = `
                    color:${item.isCloud ? '#ffb86c' : '#f8f8f2'};
                    font-size:12px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;
                `;
                nameSpan.title = item.name;
                nameSpan.textContent = (item.isCloud ? '☁️ ' : '') + item.name + (item.isList ? ' 📋' : '');

                const input = document.createElement('input');
                input.type = 'text';
                input.value = String(item.value).replace(/"/g, '&quot;');
                input.style.cssText = `
                    background:rgba(0,0,0,0.3);border:1px solid rgba(255,255,255,0.1);
                    border-radius:4px;color:#f8f8f2;padding:2px 6px;font-size:12px;
                    font-family:monospace;width:100%;box-sizing:border-box;
                `;
                input.dataset.varid = item.id;

                const lockBtn = document.createElement('button');
                lockBtn.textContent = item.frozen ? '🔓' : '🔒';
                lockBtn.style.cssText = `
                    padding:2px 8px;background:rgba(102,126,234,0.2);
                    border:1px solid rgba(102,126,234,0.3);border-radius:4px;
                    color:#8be9fd;cursor:pointer;font-size:11px;
                    transition:background 0.15s;
                `;
                lockBtn.dataset.varid = item.id;
                lockBtn.dataset.frozen = item.frozen ? 'true' : 'false';

                row.appendChild(nameSpan);
                row.appendChild(input);
                row.appendChild(lockBtn);
                fragment.appendChild(row);
            });

            if (hasMore) {
                const moreRow = document.createElement('div');
                moreRow.style.cssText = `
                    padding: 8px 0;
                    color: #6272a4;
                    font-size: 12px;
                    text-align: center;
                    border-top: 1px solid rgba(255,255,255,0.05);
                `;
                moreRow.textContent = `还有 ${filtered.length - MAX_VISIBLE_ITEMS} 个变量未显示，请使用搜索功能`;
                fragment.appendChild(moreRow);
            }

            varList.innerHTML = '';
            varList.appendChild(fragment);
            isVarRendering = false;
        });
    }

    function updateVariable(id, value) {
        if (!vmInstance) return;
        const targets = vmInstance.runtime?.targets || [];
        for (const target of targets) {
            if (target.variables && target.variables[id]) {
                target.variables[id].value = value;
                break;
            }
        }
    }

    function updateVariableFrozen(id, frozen) {
        if (!vmInstance) return;
        const targets = vmInstance.runtime?.targets || [];
        for (const target of targets) {
            if (target.variables && target.variables[id]) {
                target.variables[id]._csrt_frozen = frozen;
                break;
            }
        }
    }

    // ==================== 加载云数据 ====================

    function loadCloudData(cloudContents) {
        vmPromise.then(async (vm) => {
            if (!vm) return;

            let ccwDataExt = null;
            if (vm.extensionManager) {
                const loadedExts = vm.extensionManager._loadedExtensions || {};
                if (loadedExts['ccwdata']) {
                    ccwDataExt = loadedExts['ccwdata'];
                }
            }

            if (!ccwDataExt) {
                if (vm.extensionManager?._gandiExternalExtensionServices?.['ccwdata']) {
                    ccwDataExt = vm.extensionManager._gandiExternalExtensionServices['ccwdata'];
                }
            }

            if (!ccwDataExt) {
                cloudContents['project'].innerHTML = '<div style="color:#6272a4;padding:8px;">CCWData扩展未加载</div>';
                cloudContents['user'].innerHTML = '<div style="color:#6272a4;padding:8px;">CCWData扩展未加载</div>';
                return;
            }

            try {
                const projectData = await ccwDataExt._getAllProjectData?.() || {};
                const projectKeys = Object.keys(projectData);
                if (projectKeys.length === 0) {
                    cloudContents['project'].innerHTML = '<div style="color:#6272a4;padding:8px;">暂无作品云数据</div>';
                } else {
                    let html = `
                        <div style="display:grid;grid-template-columns:1fr 1fr auto;gap:4px 8px;padding:4px 0;border-bottom:1px solid rgba(255,255,255,0.05);color:#6272a4;font-size:11px;">
                            <span>键名</span>
                            <span>值</span>
                            <span>操作</span>
                        </div>
                    `;
                    projectKeys.forEach(key => {
                        const value = projectData[key];
                        html += `
                            <div style="display:grid;grid-template-columns:1fr 1fr auto;gap:4px 8px;padding:4px 0;border-bottom:1px solid rgba(255,255,255,0.03);align-items:center;">
                                <span style="color:#f8f8f2;font-size:12px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;" title="${key}">${key}</span>
                                <input type="text" value="${String(value).replace(/"/g, '&quot;')}"
                                       style="background:rgba(0,0,0,0.3);border:1px solid rgba(255,255,255,0.1);border-radius:4px;color:#f8f8f2;padding:2px 6px;font-size:12px;font-family:monospace;width:100%;box-sizing:border-box;"
                                       data-key="${key}" data-type="project" />
                                <button style="padding:2px 8px;background:rgba(255,184,108,0.2);border:1px solid rgba(255,184,108,0.3);border-radius:4px;color:#ffb86c;cursor:pointer;font-size:11px;"
                                        data-key="${key}" data-type="project">
                                    ✏️
                                </button>
                            </div>
                        `;
                    });
                    cloudContents['project'].innerHTML = html;

                    cloudContents['project'].querySelectorAll('input[data-key]').forEach(input => {
                        input.addEventListener('change', function() {
                            const key = this.dataset.key;
                            const type = this.dataset.type;
                            let value = this.value;
                            try {
                                value = JSON.parse(value);
                            } catch (e) {}
                            if (type === 'project') {
                                ccwDataExt._setValueToProject?.(key, value);
                            }
                            showToast(`✅ 已更新云数据: ${key}`);
                        });
                    });

                    cloudContents['project'].querySelectorAll('button[data-key]').forEach(btn => {
                        btn.addEventListener('click', function() {
                            const input = this.parentElement.querySelector('input');
                            if (input) { input.focus(); input.select(); }
                        });
                    });
                }

                const userData = await ccwDataExt._getAllUserData?.() || {};
                const userKeys = Object.keys(userData);
                if (userKeys.length === 0) {
                    cloudContents['user'].innerHTML = '<div style="color:#6272a4;padding:8px;">暂无用户云数据</div>';
                } else {
                    let html = `
                        <div style="display:grid;grid-template-columns:1fr 1fr auto;gap:4px 8px;padding:4px 0;border-bottom:1px solid rgba(255,255,255,0.05);color:#6272a4;font-size:11px;">
                            <span>键名</span>
                            <span>值</span>
                            <span>操作</span>
                        </div>
                    `;
                    userKeys.forEach(key => {
                        const value = userData[key];
                        html += `
                            <div style="display:grid;grid-template-columns:1fr 1fr auto;gap:4px 8px;padding:4px 0;border-bottom:1px solid rgba(255,255,255,0.03);align-items:center;">
                                <span style="color:#f8f8f2;font-size:12px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;" title="${key}">${key}</span>
                                <input type="text" value="${String(value).replace(/"/g, '&quot;')}"
                                       style="background:rgba(0,0,0,0.3);border:1px solid rgba(255,255,255,0.1);border-radius:4px;color:#f8f8f2;padding:2px 6px;font-size:12px;font-family:monospace;width:100%;box-sizing:border-box;"
                                       data-key="${key}" data-type="user" />
                                <button style="padding:2px 8px;background:rgba(255,184,108,0.2);border:1px solid rgba(255,184,108,0.3);border-radius:4px;color:#ffb86c;cursor:pointer;font-size:11px;"
                                        data-key="${key}" data-type="user">
                                    ✏️
                                </button>
                            </div>
                        `;
                    });
                    cloudContents['user'].innerHTML = html;

                    cloudContents['user'].querySelectorAll('input[data-key]').forEach(input => {
                        input.addEventListener('change', function() {
                            const key = this.dataset.key;
                            const type = this.dataset.type;
                            let value = this.value;
                            try {
                                value = JSON.parse(value);
                            } catch (e) {}
                            if (type === 'user') {
                                ccwDataExt._setValueToUser?.(key, value);
                            }
                            showToast(`✅ 已更新用户云数据: ${key}`);
                        });
                    });

                    cloudContents['user'].querySelectorAll('button[data-key]').forEach(btn => {
                        btn.addEventListener('click', function() {
                            const input = this.parentElement.querySelector('input');
                            if (input) { input.focus(); input.select(); }
                        });
                    });
                }
            } catch (e) {
                privateLog.addError('加载云数据失败: ' + e.message);
                cloudContents['project'].innerHTML = `<div style="color:#ff5555;padding:8px;">❌ 加载失败: ${e.message}</div>`;
                cloudContents['user'].innerHTML = `<div style="color:#ff5555;padding:8px;">❌ 加载失败: ${e.message}</div>`;
            }
        }).catch(e => {
            privateLog.addError('获取VM失败: ' + e.message);
        });
    }

    // ==================== 下载项目源码 ====================

    async function downloadProject() {
        try {
            const vm = await getVM();
            if (!vm) {
                alert('❌ 无法获取VM实例');
                return;
            }

            const runtime = vm.runtime;
            if (!runtime) {
                alert('❌ 无法获取Runtime');
                return;
            }

            let projectData = runtime.getProjectData?.();
            if (!projectData) {
                if (vm._projectData) projectData = vm._projectData;
                else if (runtime._projectData) projectData = runtime._projectData;
                else if (vm.projectData) projectData = vm.projectData;
            }

            if (!projectData) {
                alert('❌ 无法获取项目数据');
                return;
            }

            let JSZip = null;
            if (vm.exports?.JSZip) {
                JSZip = vm.exports.JSZip;
            } else if (window.JSZip) {
                JSZip = window.JSZip;
            }

            if (!JSZip) {
                alert('❌ 无法加载JSZip库');
                return;
            }

            const zip = new JSZip();
            const projectJson = typeof projectData === 'string' ? JSON.parse(projectData) : projectData;
            zip.file('project.json', JSON.stringify(projectJson, null, 2));

            const filesToFetch = [];

            if (projectJson.gandi?.assets) {
                projectJson.gandi.assets.forEach(asset => {
                    if (asset.md5ext) {
                        filesToFetch.push({
                            name: asset.md5ext,
                            url: `https://m.ccw.site/user_projects_assets/${encodeURIComponent(asset.md5ext)}`
                        });
                    }
                });
            }

            if (projectJson.targets) {
                projectJson.targets.forEach(target => {
                    if (target.sounds) {
                        target.sounds.forEach(sound => {
                            if (sound.md5ext) {
                                filesToFetch.push({
                                    name: sound.md5ext,
                                    url: `https://m.ccw.site/user_projects_assets/${encodeURIComponent(sound.md5ext)}`
                                });
                            }
                        });
                    }
                    if (target.costumes) {
                        target.costumes.forEach(costume => {
                            if (costume.md5ext) {
                                filesToFetch.push({
                                    name: costume.md5ext,
                                    url: `https://m.ccw.site/user_projects_assets/${encodeURIComponent(costume.md5ext)}`
                                });
                            }
                        });
                    }
                });
            }

            let loaded = 0;
            const total = filesToFetch.length;
            if (total > 0) {
                showToast(`⏳ 正在下载资源 (0/${total})...`);
            }

            const concurrency = 32;
            let index = 0;

            await Promise.all(
                new Array(concurrency).fill(0).map(async () => {
                    while (index < filesToFetch.length) {
                        const file = filesToFetch[index++];
                        if (zip.file(file.name)) continue;
                        try {
                            const res = await fetch(file.url);
                            if (!res.ok) throw new Error(`HTTP ${res.status}`);
                            const blob = await res.blob();
                            zip.file(file.name, blob);
                            loaded++;
                            if (loaded % 5 === 0) {
                                showToast(`⏳ 正在下载资源 (${loaded}/${total})...`);
                            }
                        } catch (e) {
                            privateLog.addError(`下载资源失败: ${file.name} - ${e.message}`);
                        }
                    }
                })
            );

            showToast(`📦 正在打包...`);
            const content = await zip.generateAsync({ type: 'arraybuffer' });
            const url = URL.createObjectURL(
                new Blob([content], { type: 'application/zip' })
            );

            const a = document.createElement('a');
            a.href = url;
            a.download = `project_${Date.now()}.sb3`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);

            showToast(`✅ 下载完成！共 ${filesToFetch.length} 个文件`);
        } catch (e) {
            privateLog.addError('下载项目失败: ' + e.message);
            alert(`❌ 下载失败: ${e.message}`);
        }
    }

    // ==================== 创建信息面板 ====================

    async function createInfoPanel() {
        const container = document.createElement('div');
        container.style.cssText = `display:flex;flex-direction:column;gap:12px;`;

        const refreshBtn = document.createElement('button');
        refreshBtn.textContent = '🔄 刷新信息';
        refreshBtn.style.cssText = `
            padding: 8px 16px;
            background: rgba(102,126,234,0.3);
            border: 1px solid rgba(102,126,234,0.5);
            border-radius: 8px;
            color:#fff;
            cursor:pointer;
            font-size:13px;
            align-self:flex-start;
            transition:all 0.2s;
        `;
        refreshBtn.onmouseover = () => refreshBtn.style.background = 'rgba(102,126,234,0.5)';
        refreshBtn.onmouseout = () => refreshBtn.style.background = 'rgba(102,126,234,0.3)';

        const infoDiv = document.createElement('div');
        infoDiv.style.cssText = `
            background:rgba(255,255,255,0.05);
            border-radius:8px;
            padding:16px;
            font-size:13px;
            line-height:1.8;
            font-family:'Courier New',monospace;
            max-height:400px;
            overflow-y:auto;
        `;
        infoDiv.id = 'srt-info-content';

        async function updateInfo() {
            const info = await getProjectInfo(false);
            const isProfile = info.isProfile || false;

            if (isProfile) {
                let html = `
                    <div style="color:#8be9fd;font-weight:600;margin-bottom:8px;">📋 个人信息</div>
                    <div style="display:grid;grid-template-columns:80px 1fr;gap:4px 12px;">
                        <span style="color:#6272a4;">标题:</span>
                        <span style="color:#f8f8f2;">${info.title || '未知'}</span>
                        <span style="color:#6272a4;">个人ID:</span>
                        <span style="color:#f1fa8c;">${info.userId || '未识别'}</span>
                        <span style="color:#6272a4;">名称:</span>
                        <span style="color:#f8f8f2;">${info.userName || '未知用户'}</span>
                    </div>
                `;
                infoDiv.innerHTML = html;
                return;
            }

            let html = `
                <div style="color:#8be9fd;font-weight:600;margin-bottom:8px;">📋 当前作品信息</div>
                <div style="display:grid;grid-template-columns:80px 1fr;gap:4px 12px;">
                    <span style="color:#6272a4;">标题:</span>
                    <span style="color:#f8f8f2;">${info.title || '未知'}</span>
                    <span style="color:#6272a4;">项目ID:</span>
                    <span style="color:#f1fa8c;">${info.projectId || '未识别'}</span>
                    <span style="color:#6272a4;">创作者:</span>
                    <span style="color:#f8f8f2;">${info.creator || '未知'}</span>
                    <span style="color:#6272a4;">VM状态:</span>
                    <span style="color:#50fa7b;">${info.vmInfo ? '✅ 已就绪' : '❌ 未就绪'}</span>
                    <span style="color:#6272a4;">自定义扩展:</span>
                    <span style="color:#ffb86c;">${info.customExtensions.length}</span>
                    <span style="color:#6272a4;">官方扩展:</span>
                    <span style="color:#8be9fd;">${info.internalExtensions.length}</span>
                    <span style="color:#6272a4;">CCWData:</span>
                    <span style="color:${info.hasCCWData ? '#50fa7b' : '#6272a4'};">${info.hasCCWData ? '✅ 已加载' : '❌ 未加载'}</span>
                    <span style="color:#6272a4;">经济合约:</span>
                    <span style="color:${info.hasGandiEconomy ? '#f1fa8c' : '#6272a4'};">${info.hasGandiEconomy ? '✅ 已加载' : '❌ 未加载'}</span>
                    ${info.hasMaliciousPatterns ? `<span style="color:#ff5555;">⚠️ 检测到可疑模式</span>` : ''}
                </div>
            `;

            if (info.customExtensions.length > 0) {
                html += `
                    <div style="margin-top:12px;color:#ffb86c;font-weight:600;">🔌 自定义扩展详情</div>
                    <div style="margin-top:4px;font-size:12px;">
                `;
                info.customExtensions.forEach(ext => {
                    const status = ext.isLoaded ? '✅ 已加载' : '⏳ 未加载';
                    const modified = ext.modified ? '✏️ 已修改' : '';
                    html += `
                        <div style="display:flex;justify-content:space-between;padding:4px 0;border-bottom:1px solid rgba(255,255,255,0.05);">
                            <span style="color:#f8f8f2;">${ext.name}</span>
                            <span style="color:#6272a4;font-size:11px;">${status} ${modified} | ${ext.source}</span>
                        </div>
                    `;
                });
                html += `</div>`;
            }

            if (info.internalExtensions.length > 0) {
                html += `
                    <div style="margin-top:8px;color:#8be9fd;font-weight:600;">📦 官方/内部扩展</div>
                    <div style="margin-top:4px;font-size:11px;color:#6272a4;">
                        ${info.internalExtensions.join(', ')}
                    </div>
                `;
            }

            if (info.warnings.length > 0) {
                html += `
                    <div style="margin-top:12px;color:#ff5555;font-weight:600;">🚨 安全警告</div>
                    <div style="margin-top:4px;font-size:12px;">
                `;
                info.warnings.forEach(w => {
                    html += `<div style="padding:4px 0;color:#ffb86c;">• ${w}</div>`;
                });
                html += `</div>`;
            }

            infoDiv.innerHTML = html;
        }

        refreshBtn.onclick = updateInfo;
        setTimeout(updateInfo, 500);

        container.appendChild(refreshBtn);
        container.appendChild(infoDiv);

        // 标题修改功能
        const titleSection = document.createElement('div');
        titleSection.style.cssText = `
            margin-top: 12px;
            padding: 12px;
            background: rgba(255,255,255,0.03);
            border-radius: 8px;
            border: 1px solid rgba(255,255,255,0.05);
        `;

        const titleLabel = document.createElement('div');
        titleLabel.style.cssText = `
            color: #8be9fd;
            font-weight: 600;
            font-size: 13px;
            margin-bottom: 8px;
        `;
        titleLabel.textContent = '✏️ 修改浏览器标题';

        const titleRow = document.createElement('div');
        titleRow.style.cssText = `
            display: flex;
            gap: 8px;
            align-items: center;
            flex-wrap: wrap;
        `;

        const titleInput = document.createElement('input');
        titleInput.type = 'text';
        titleInput.placeholder = '输入新标题...';
        titleInput.style.cssText = `
            flex: 1;
            padding: 6px 12px;
            background: rgba(0,0,0,0.3);
            border: 1px solid rgba(255,255,255,0.1);
            border-radius: 6px;
            color: #f8f8f2;
            font-size: 13px;
            min-width: 150px;
        `;
        titleInput.value = document.title;

        const applyTitleBtn = document.createElement('button');
        applyTitleBtn.textContent = '应用';
        applyTitleBtn.style.cssText = `
            padding: 6px 16px;
            background: rgba(102,126,234,0.3);
            border: 1px solid rgba(102,126,234,0.5);
            border-radius: 6px;
            color: #fff;
            cursor: pointer;
            font-size: 12px;
            transition: all 0.2s;
        `;
        applyTitleBtn.onmouseover = () => applyTitleBtn.style.background = 'rgba(102,126,234,0.5)';
        applyTitleBtn.onmouseout = () => applyTitleBtn.style.background = 'rgba(102,126,234,0.3)';
        applyTitleBtn.onclick = function() {
            const result = setBrowserTitle(titleInput.value);
            if (result.success) {
                titleInput.value = result.title;
                this.textContent = '✅ 已应用';
                setTimeout(() => { this.textContent = '应用'; }, 1500);
            } else {
                alert(result.error);
            }
        };

        const resetTitleBtn = document.createElement('button');
        resetTitleBtn.textContent = '↩️ 恢复';
        resetTitleBtn.style.cssText = `
            padding: 6px 12px;
            background: rgba(255,255,255,0.05);
            border: 1px solid rgba(255,255,255,0.1);
            border-radius: 6px;
            color: #6272a4;
            cursor: pointer;
            font-size: 12px;
            transition: all 0.2s;
        `;
        resetTitleBtn.onmouseover = () => resetTitleBtn.style.background = 'rgba(255,255,255,0.1)';
        resetTitleBtn.onmouseout = () => resetTitleBtn.style.background = 'rgba(255,255,255,0.05)';
        resetTitleBtn.onclick = function() {
            const result = resetBrowserTitle();
            titleInput.value = result.title;
            this.textContent = '✅ 已恢复';
            setTimeout(() => { this.textContent = '↩️ 恢复'; }, 1500);
        };

        titleRow.appendChild(titleInput);
        titleRow.appendChild(applyTitleBtn);
        titleRow.appendChild(resetTitleBtn);
        titleSection.appendChild(titleLabel);
        titleSection.appendChild(titleRow);
        container.appendChild(titleSection);

        return container;
    }

    // ==================== 创建扩展面板 ====================

    function createExtensionPanel() {
        const container = document.createElement('div');
        container.style.cssText = `display:flex;flex-direction:column;gap:12px;`;

        const scanBtn = document.createElement('button');
        scanBtn.textContent = '🔍 扫描扩展';
        scanBtn.style.cssText = `
            padding: 8px 16px;
            background: rgba(102,126,234,0.3);
            border: 1px solid rgba(102,126,234,0.5);
            border-radius: 8px;
            color:#fff;
            cursor:pointer;
            font-size:13px;
            align-self:flex-start;
            transition:all 0.2s;
        `;
        scanBtn.onmouseover = () => scanBtn.style.background = 'rgba(102,126,234,0.5)';
        scanBtn.onmouseout = () => scanBtn.style.background = 'rgba(102,126,234,0.3)';

        const resultDiv = document.createElement('div');
        resultDiv.style.cssText = `
            background:rgba(255,255,255,0.05);
            border-radius:8px;
            padding:16px;
            font-size:13px;
            line-height:1.8;
            font-family:'Courier New',monospace;
            max-height:400px;
            overflow-y:auto;
        `;
        resultDiv.id = 'srt-scan-result';
        resultDiv.innerHTML = '<div style="color:#6272a4;">点击"扫描扩展"开始分析...</div>';

        scanBtn.onclick = function() {
            getProjectInfo(true).then(info => {
                let html = `
                    <div style="color:#8be9fd;font-weight:600;margin-bottom:8px;">🔍 扩展扫描结果</div>
                    <div style="color:#6272a4;font-size:12px;margin-bottom:8px;">
                        自定义: ${info.customExtensions.length} | 官方: ${info.internalExtensions.length}
                    </div>
                `;

                if (info.customExtensions.length === 0) {
                    html += `<div style="color:#50fa7b;">✅ 未发现自定义扩展</div>`;
                } else {
                    info.customExtensions.forEach((ext, index) => {
                        const status = ext.isLoaded ? '✅ 已加载' : '⏳ 未加载';
                        const modified = ext.modified ? '✏️ 已修改' : '';
                        html += `
                            <div style="background:rgba(255,255,255,0.03);border-radius:6px;padding:8px;margin-bottom:8px;border-left:3px solid ${ext.isLoaded ? '#50fa7b' : '#ffb86c'};">
                                <div style="display:flex;justify-content:space-between;align-items:center;">
                                    <span style="color:#f8f8f2;font-weight:600;">${index + 1}. ${ext.name}</span>
                                    <span style="color:#6272a4;font-size:11px;">${status} ${modified}</span>
                                </div>
                                <div style="color:#6272a4;font-size:11px;word-break:break-all;margin-top:4px;">
                                    URL: ${ext.url || '未知'}
                                    <br>来源: ${ext.source}
                                </div>
                                <div style="margin-top:6px;">
                                    <button class="srt-inspect-ext" data-name="${ext.name}" style="padding:2px 12px;background:rgba(102,126,234,0.2);border:1px solid rgba(102,126,234,0.3);border-radius:4px;color:#8be9fd;cursor:pointer;font-size:11px;">
                                        🔎 检查代码
                                    </button>
                                    <button class="srt-modify-ext" data-name="${ext.name}" style="margin-left:4px;padding:2px 12px;background:rgba(255,181,0,0.2);border:1px solid rgba(255,181,0,0.3);border-radius:4px;color:#ffb86c;cursor:pointer;font-size:11px;">
                                        ✏️ 修改代码
                                    </button>
                                </div>
                            </div>
                        `;
                    });
                }

                resultDiv.innerHTML = html;

                resultDiv.querySelectorAll('.srt-inspect-ext').forEach(btn => {
                    btn.onclick = function() {
                        const name = this.dataset.name;
                        showExtensionCodeViewer(name);
                    };
                });

                resultDiv.querySelectorAll('.srt-modify-ext').forEach(btn => {
                    btn.onclick = function() {
                        const name = this.dataset.name;
                        showExtensionCodeEditor(name);
                    };
                });
            }).catch(e => {
                resultDiv.innerHTML = `<div style="color:#ff5555;">❌ 扫描失败: ${e.message}</div>`;
            });
        };

        container.appendChild(scanBtn);
        container.appendChild(resultDiv);
        return container;
    }

    async function showExtensionCodeViewer(extName) {
        const code = await getExtensionCode(extName);
        if (!code) {
            alert(`无法获取扩展 "${extName}" 的代码`);
            return;
        }

        const overlay = document.createElement('div');
        overlay.style.cssText = `
            position: fixed;
            top: 0; left: 0; right: 0; bottom: 0;
            background: rgba(0, 0, 0, 0.8);
            z-index: 1000003;
            display: flex;
            align-items: center;
            justify-content: center;
            backdrop-filter: blur(4px);
        `;

        const dialog = document.createElement('div');
        dialog.style.cssText = `
            background: #1a1a2e;
            border-radius: 16px;
            padding: 24px;
            width: 85%;
            max-width: 800px;
            max-height: 85vh;
            border: 2px solid #8be9fd;
            box-shadow: 0 20px 60px rgba(0,0,0,0.9);
            color: #eee;
            display: flex;
            flex-direction: column;
            overflow: hidden;
        `;

        const header = document.createElement('div');
        header.style.cssText = `
            display: flex;
            justify-content: space-between;
            align-items: center;
            padding-bottom: 12px;
            border-bottom: 1px solid rgba(255,255,255,0.1);
            flex-shrink: 0;
        `;

        const title = document.createElement('span');
        title.style.cssText = `
            font-size: 18px;
            font-weight: 600;
            color: #8be9fd;
        `;
        title.textContent = `🔎 扩展代码: ${extName}`;
        header.appendChild(title);

        const closeBtn = document.createElement('button');
        closeBtn.textContent = '✕';
        closeBtn.style.cssText = `
            background: none;
            border: none;
            color: #6272a4;
            font-size: 22px;
            cursor: pointer;
            padding: 0 8px;
        `;
        closeBtn.onclick = () => overlay.remove();
        header.appendChild(closeBtn);
        dialog.appendChild(header);

        const codeDiv = document.createElement('div');
        codeDiv.style.cssText = `
            flex: 1;
            margin: 12px 0;
            background: rgba(0,0,0,0.4);
            border-radius: 8px;
            padding: 12px;
            overflow-y: auto;
            font-family: 'Courier New', monospace;
            font-size: 12px;
            line-height: 1.6;
            color: #f8f8f2;
            white-space: pre-wrap;
            word-break: break-all;
            max-height: 500px;
            border: 1px solid rgba(255,255,255,0.05);
        `;
        codeDiv.textContent = code;
        dialog.appendChild(codeDiv);

        const footer = document.createElement('div');
        footer.style.cssText = `
            display: flex;
            gap: 12px;
            justify-content: flex-end;
            flex-shrink: 0;
            padding-top: 8px;
        `;

        const closeFooterBtn = document.createElement('button');
        closeFooterBtn.textContent = '关闭';
        closeFooterBtn.style.cssText = `
            padding: 8px 20px;
            background: rgba(255,255,255,0.05);
            border: 1px solid rgba(255,255,255,0.1);
            border-radius: 8px;
            color: #6272a4;
            cursor: pointer;
            font-size: 14px;
            transition: all 0.2s;
        `;
        closeFooterBtn.onmouseover = () => closeFooterBtn.style.background = 'rgba(255,255,255,0.1)';
        closeFooterBtn.onmouseout = () => closeFooterBtn.style.background = 'rgba(255,255,255,0.05)';
        closeFooterBtn.onclick = () => overlay.remove();
        footer.appendChild(closeFooterBtn);

        dialog.appendChild(footer);
        overlay.appendChild(dialog);
        document.body.appendChild(overlay);
    }

    async function showExtensionCodeEditor(extName) {
        const code = await getExtensionCode(extName);
        if (!code) {
            alert(`无法获取扩展 "${extName}" 的代码`);
            return;
        }

        const overlay = document.createElement('div');
        overlay.style.cssText = `
            position: fixed;
            top: 0; left: 0; right: 0; bottom: 0;
            background: rgba(0, 0, 0, 0.8);
            z-index: 1000003;
            display: flex;
            align-items: center;
            justify-content: center;
            backdrop-filter: blur(4px);
        `;

        const dialog = document.createElement('div');
        dialog.style.cssText = `
            background: #1a1a2e;
            border-radius: 16px;
            padding: 24px;
            width: 85%;
            max-width: 800px;
            max-height: 85vh;
            border: 2px solid #ffb86c;
            box-shadow: 0 20px 60px rgba(0,0,0,0.9);
            color: #eee;
            display: flex;
            flex-direction: column;
            overflow: hidden;
        `;

        const header = document.createElement('div');
        header.style.cssText = `
            display: flex;
            justify-content: space-between;
            align-items: center;
            padding-bottom: 12px;
            border-bottom: 1px solid rgba(255,255,255,0.1);
            flex-shrink: 0;
        `;

        const title = document.createElement('span');
        title.style.cssText = `
            font-size: 18px;
            font-weight: 600;
            color: #ffb86c;
        `;
        title.textContent = `✏️ 编辑扩展: ${extName}`;
        header.appendChild(title);

        const closeBtn = document.createElement('button');
        closeBtn.textContent = '✕';
        closeBtn.style.cssText = `
            background: none;
            border: none;
            color: #6272a4;
            font-size: 22px;
            cursor: pointer;
            padding: 0 8px;
        `;
        closeBtn.onclick = () => overlay.remove();
        header.appendChild(closeBtn);
        dialog.appendChild(header);

        const textarea = document.createElement('textarea');
        textarea.style.cssText = `
            width: 100%;
            height: 400px;
            margin: 12px 0;
            background: rgba(0,0,0,0.4);
            color: #f8f8f2;
            border: 1px solid rgba(255,255,255,0.1);
            border-radius: 8px;
            padding: 12px;
            font-family: 'Courier New', monospace;
            font-size: 12px;
            resize: vertical;
            box-sizing: border-box;
            tab-size: 2;
            line-height: 1.6;
        `;
        textarea.value = code;
        dialog.appendChild(textarea);

        const footer = document.createElement('div');
        footer.style.cssText = `
            display: flex;
            gap: 12px;
            justify-content: flex-end;
            flex-shrink: 0;
            padding-top: 8px;
        `;

        const cancelBtn = document.createElement('button');
        cancelBtn.textContent = '取消';
        cancelBtn.style.cssText = `
            padding: 8px 20px;
            background: rgba(255,255,255,0.05);
            border: 1px solid rgba(255,255,255,0.1);
            border-radius: 8px;
            color: #6272a4;
            cursor: pointer;
            font-size: 14px;
            transition: all 0.2s;
        `;
        cancelBtn.onmouseover = () => cancelBtn.style.background = 'rgba(255,255,255,0.1)';
        cancelBtn.onmouseout = () => cancelBtn.style.background = 'rgba(255,255,255,0.05)';
        cancelBtn.onclick = () => overlay.remove();

        const saveBtn = document.createElement('button');
        saveBtn.textContent = '💾 保存修改';
        saveBtn.style.cssText = `
            padding: 8px 24px;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            border: none;
            border-radius: 8px;
            color: white;
            cursor: pointer;
            font-size: 14px;
            font-weight: 600;
            transition: all 0.2s;
        `;
        saveBtn.onmouseover = () => saveBtn.style.opacity = '0.9';
        saveBtn.onmouseout = () => saveBtn.style.opacity = '1';
        saveBtn.onclick = function() {
            const newCode = textarea.value;
            getProjectInfo(true).then(info => {
                const ext = info.customExtensions.find(e => e.name === extName);
                if (ext) {
                    ext.modifiedCode = newCode;
                    ext.modified = true;
                }
                modifyExtensionCode(extName, newCode).then(result => {
                    if (result.success) {
                        alert(`✅ 扩展 "${extName}" 已修改，重新加载后生效`);
                    } else {
                        alert(`⚠️ 修改已保存，但重新加载扩展失败: ${result.error}\n\n修改将在下次加载项目时应用。`);
                    }
                }).catch(e => {
                    alert(`⚠️ 保存成功，但应用失败: ${e.message}`);
                });
                overlay.remove();
            });
        };

        footer.appendChild(cancelBtn);
        footer.appendChild(saveBtn);
        dialog.appendChild(footer);

        overlay.appendChild(dialog);
        document.body.appendChild(overlay);
        setTimeout(() => textarea.focus(), 100);
    }

    // ==================== 创建代码执行面板 ====================

    function createExecutorPanel() {
        const container = document.createElement('div');
        container.style.cssText = `display:flex;flex-direction:column;gap:12px;`;

        const warning = document.createElement('div');
        warning.style.cssText = `
            background:rgba(255,181,0,0.1);
            border:1px solid rgba(255,181,0,0.3);
            border-radius:8px;
            padding:8px 12px;
            font-size:12px;
            color:#ffb86c;
        `;
        warning.textContent = '⚠️ 此功能仅用于安全研究，执行的代码将具有页面完整权限。';
        container.appendChild(warning);

        const textarea = document.createElement('textarea');
        textarea.style.cssText = `
            width:100%;
            height:150px;
            background:rgba(0,0,0,0.3);
            color:#f8f8f2;
            border:1px solid rgba(255,255,255,0.1);
            border-radius:8px;
            padding:10px;
            font-family:'Courier New',monospace;
            font-size:12px;
            resize:vertical;
            box-sizing:border-box;
            tab-size:2;
        `;
        textarea.placeholder = `// 在此输入JavaScript代码\n\nvmPromise.then(vm => {\n  console.log('VM已就绪', vm.runtime.targets);\n});`;
        container.appendChild(textarea);

        const quickRow = document.createElement('div');
        quickRow.style.cssText = `
            display: flex;
            gap: 6px;
            flex-wrap: wrap;
        `;

        const quickScripts = [
            { label: '📋 控制台', code: 'console.log("页面信息:", document.title, location.href);\nconsole.log("页面加载时间:", performance.now(), "ms");' },
            { label: '🔍 DOM查询', code: `// 查询页面所有元素\nconst allElements = document.querySelectorAll("*");\nconsole.log("页面元素总数:", allElements.length);\n\n// 查询所有按钮\nconst buttons = document.querySelectorAll("button");\nconsole.log("按钮数量:", buttons.length);\nbuttons.forEach((b, i) => console.log(i+1, b.textContent?.trim() || "(无文本)"));` },
            { label: '📊 性能', code: `// 页面性能数据\nconsole.table(performance.getEntriesByType("navigation"));\nconsole.log("DNS查询耗时:", performance.getEntriesByName("document")[0]?.domainLookupEnd - performance.getEntriesByName("document")[0]?.domainLookupStart, "ms");\nconsole.log("白屏时间:", performance.getEntriesByName("document")[0]?.responseStart, "ms");` },
            { label: '🔄 自动点击', code: `// 自动点击页面第一个按钮\nconst btn = document.querySelector("button");\nif (btn) {\n  btn.click();\n  console.log("✅ 已点击按钮:", btn.textContent?.trim() || "无文本");\n} else {\n  console.log("❌ 未找到按钮");\n}` }
        ];

        quickScripts.forEach(script => {
            const btn = document.createElement('button');
            btn.textContent = script.label;
            btn.style.cssText = `
                padding: 4px 12px;
                background: rgba(255,255,255,0.05);
                border: 1px solid rgba(255,255,255,0.1);
                border-radius: 4px;
                color: #8be9fd;
                cursor: pointer;
                font-size: 11px;
                transition: all 0.2s;
            `;
            btn.onmouseover = () => btn.style.background = 'rgba(255,255,255,0.1)';
            btn.onmouseout = () => btn.style.background = 'rgba(255,255,255,0.05)';
            btn.onclick = () => {
                textarea.value = script.code;
                btn.style.background = 'rgba(139,233,253,0.2)';
                setTimeout(() => {
                    btn.style.background = 'rgba(255,255,255,0.05)';
                }, 300);
                textarea.focus();
            };
            quickRow.appendChild(btn);
        });

        container.appendChild(quickRow);

        const executeBtn = document.createElement('button');
        executeBtn.textContent = '▶ 执行代码 (安全研究)';
        executeBtn.style.cssText = `
            padding:10px;
            background:linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            border:none;
            border-radius:8px;
            color:white;
            font-weight:600;
            cursor:pointer;
            font-size:14px;
            transition:all 0.2s;
        `;
        executeBtn.onmouseover = () => executeBtn.style.opacity = '0.9';
        executeBtn.onmouseout = () => executeBtn.style.opacity = '1';
        executeBtn.onclick = function() {
            const code = textarea.value;
            try {
                const result = (0, eval)(code);
                const resultDiv = document.createElement('div');
                resultDiv.style.cssText = `
                    margin-top:8px;
                    padding:8px 12px;
                    background:rgba(80,250,123,0.1);
                    border:1px solid rgba(80,250,123,0.3);
                    border-radius:4px;
                    color:#50fa7b;
                    font-size:12px;
                    font-family:'Courier New',monospace;
                    max-height:200px;
                    overflow-y:auto;
                    white-space:pre-wrap;
                `;
                resultDiv.textContent = `✅ 执行完成\n结果: ${result !== undefined ? JSON.stringify(result, null, 2) : 'undefined'}`;
                container.appendChild(resultDiv);
                setTimeout(() => resultDiv.remove(), 8000);
            } catch (err) {
                const errDiv = document.createElement('div');
                errDiv.style.cssText = `
                    margin-top:8px;
                    padding:8px 12px;
                    background:rgba(255,85,85,0.1);
                    border:1px solid rgba(255,85,85,0.3);
                    border-radius:4px;
                    color:#ff5555;
                    font-size:12px;
                `;
                errDiv.textContent = `❌ 错误: ${err.message}`;
                container.appendChild(errDiv);
                setTimeout(() => errDiv.remove(), 5000);
                privateLog.addError('代码执行错误: ' + err.message);
            }
        };
        container.appendChild(executeBtn);

        return container;
    }

    // ==================== 创建日志面板 ====================

    function createLogPanel() {
        const container = document.createElement('div');
        container.style.cssText = `display:flex;flex-direction:column;gap:12px;`;

        const controls = document.createElement('div');
        controls.style.cssText = `display:flex;gap:8px;`;

        const refreshBtn = document.createElement('button');
        refreshBtn.textContent = '🔄 刷新日志';
        refreshBtn.style.cssText = `
            padding:6px 12px;
            background:rgba(102,126,234,0.3);
            border:1px solid rgba(102,126,234,0.5);
            border-radius:6px;
            color:#fff;
            cursor:pointer;
            font-size:12px;
        `;
        refreshBtn.onmouseover = () => refreshBtn.style.background = 'rgba(102,126,234,0.5)';
        refreshBtn.onmouseout = () => refreshBtn.style.background = 'rgba(102,126,234,0.3)';

        const clearBtn = document.createElement('button');
        clearBtn.textContent = '🗑️ 清空日志';
        clearBtn.style.cssText = `
            padding:6px 12px;
            background:rgba(255,85,85,0.2);
            border:1px solid rgba(255,85,85,0.3);
            border-radius:6px;
            color:#ff5555;
            cursor:pointer;
            font-size:12px;
        `;
        clearBtn.onmouseover = () => clearBtn.style.background = 'rgba(255,85,85,0.3)';
        clearBtn.onmouseout = () => clearBtn.style.background = 'rgba(255,85,85,0.2)';
        clearBtn.onclick = () => {
            privateLog.clear();
            updateLogDisplay();
        };

        controls.appendChild(refreshBtn);
        controls.appendChild(clearBtn);
        container.appendChild(controls);

        const logDiv = document.createElement('div');
        logDiv.style.cssText = `
            background:rgba(0,0,0,0.3);
            border-radius:8px;
            padding:12px;
            font-size:12px;
            font-family:'Courier New',monospace;
            max-height:350px;
            overflow-y:auto;
            min-height:100px;
        `;
        logDiv.id = 'srt-log-content';

        function updateLogDisplay() {
            let html = '';
            const errors = privateLog.getErrors();
            if (errors.length === 0) {
                html = '<div style="color:#6272a4;">📋 无错误日志</div>';
            } else {
                errors.forEach(err => {
                    const time = new Date(err.time).toLocaleTimeString();
                    html += `<div style="color:#ff5555;padding:2px 0;border-bottom:1px solid rgba(255,255,255,0.03);">
                        <span style="color:#6272a4;">[${time}]</span> ❌ ${err.msg}
                    </div>`;
                });
            }
            logDiv.innerHTML = html;
            logDiv.scrollTop = logDiv.scrollHeight;
        }

        refreshBtn.onclick = updateLogDisplay;
        updateLogDisplay();
        container.appendChild(logDiv);

        return container;
    }

    // ==================== 创建工具窗口 ====================

    let toolWindow = null;
    let isToolVisible = false;

    function createToolWindow() {
        const windowDiv = document.createElement('div');
        windowDiv.style.cssText = `
            position: fixed;
            top: 50%;
            left: 50%;
            transform: translate(-50%, -50%);
            width: 780px;
            max-width: 95vw;
            max-height: 85vh;
            background: #1a1a2e;
            border-radius: 16px;
            box-shadow: 0 20px 60px rgba(0,0,0,0.8);
            z-index: 1000000;
            color: #eee;
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            display: none;
            flex-direction: column;
            border: 1px solid rgba(255,255,255,0.1);
            overflow: hidden;
        `;

        const header = document.createElement('div');
        header.style.cssText = `
            padding: 16px 20px;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            display: flex;
            justify-content: space-between;
            align-items: center;
            cursor: move;
            user-select: none;
            flex-shrink: 0;
        `;

        const title = document.createElement('span');
        title.style.cssText = `
            font-weight: 600;
            font-size: 16px;
            display: flex;
            align-items: center;
            gap: 10px;
        `;
        title.innerHTML = `
            <span>🔬 CSRT</span>
            <span style="font-size:11px;opacity:0.7;font-weight:400;">v${SCRIPT_VERSION}</span>
            <span style="font-size:11px;background:rgba(255,255,255,0.2);padding:2px 8px;border-radius:12px;">作者: 110200</span>
        `;

        const closeBtn = document.createElement('button');
        closeBtn.textContent = '✕';
        closeBtn.style.cssText = `
            background: none;
            border: none;
            color: white;
            font-size: 20px;
            cursor: pointer;
            padding: 0 8px;
            opacity: 0.8;
            transition: opacity 0.2s;
        `;
        closeBtn.onmouseover = () => closeBtn.style.opacity = '1';
        closeBtn.onmouseout = () => closeBtn.style.opacity = '0.8';
        closeBtn.onclick = () => {
            windowDiv.style.display = 'none';
            isToolVisible = false;
        };

        header.appendChild(title);
        header.appendChild(closeBtn);
        windowDiv.appendChild(header);

        const content = document.createElement('div');
        content.style.cssText = `
            padding: 20px;
            overflow-y: auto;
            flex: 1;
            background: #16213e;
        `;

        const tabs = document.createElement('div');
        tabs.style.cssText = `
            display: flex;
            gap: 4px;
            margin-bottom: 16px;
            border-bottom: 1px solid rgba(255,255,255,0.1);
            padding-bottom: 12px;
            flex-wrap: wrap;
        `;

        const pageType = getPageType();
        const isProfile = pageType === 'profile';

        let tabData = [
            { id: 'info', label: isProfile ? '📋 个人信息' : '📊 作品信息' }
        ];

        if (!isProfile) {
            tabData.push({ id: 'extensions', label: '🔌 扩展审查' });
        }

        tabData.push({ id: 'features', label: '🔧 附加功能' });

        if (!isProfile) {
            tabData.push({ id: 'datamodify', label: '📝 数据修改' });
        }

        tabData.push(
            { id: 'executor', label: '⌨️ 代码执行' },
            { id: 'logs', label: '📋 审查日志' }
        );

        let activeTab = 'info';
        const tabContents = {};

        tabData.forEach(tab => {
            const btn = document.createElement('button');
            btn.textContent = tab.label;
            btn.style.cssText = `
                padding: 6px 16px;
                background: ${activeTab === tab.id ? 'rgba(102,126,234,0.3)' : 'transparent'};
                color: ${activeTab === tab.id ? '#fff' : 'rgba(255,255,255,0.6)'};
                border: 1px solid ${activeTab === tab.id ? 'rgba(102,126,234,0.5)' : 'transparent'};
                border-radius: 8px;
                cursor: pointer;
                font-size: 13px;
                transition: all 0.2s;
            `;
            btn.onmouseover = () => {
                if (activeTab !== tab.id) btn.style.background = 'rgba(255,255,255,0.05)';
            };
            btn.onmouseout = () => {
                if (activeTab !== tab.id) btn.style.background = 'transparent';
            };
            btn.onclick = async () => {
                activeTab = tab.id;
                document.querySelectorAll('.csrt-tab').forEach(b => {
                    b.style.background = b.dataset.tab === activeTab ? 'rgba(102,126,234,0.3)' : 'transparent';
                    b.style.color = b.dataset.tab === activeTab ? '#fff' : 'rgba(255,255,255,0.6)';
                    b.style.borderColor = b.dataset.tab === activeTab ? 'rgba(102,126,234,0.5)' : 'transparent';
                });
                Object.keys(tabContents).forEach(key => {
                    tabContents[key].style.display = key === activeTab ? 'block' : 'none';
                });
                if (tab.id === 'datamodify') {
                    const parent = tabContents['datamodify'];
                    if (parent) {
                        parent.innerHTML = '';
                        const newPanel = createDataModifyPanel();
                        parent.appendChild(newPanel);
                    }
                }
                if (tab.id === 'info') {
                    const refreshBtn = document.querySelector('#srt-info-content')?.parentElement?.querySelector('button');
                    if (refreshBtn) refreshBtn.click();
                }
            };
            btn.dataset.tab = tab.id;
            btn.className = 'csrt-tab';
            tabs.appendChild(btn);

            let tabContent;
            if (tab.id === 'info') {
                tabContent = document.createElement('div');
                createInfoPanel().then(panel => {
                    tabContent.appendChild(panel);
                });
            } else if (tab.id === 'extensions') {
                tabContent = createExtensionPanel();
            } else if (tab.id === 'features') {
                tabContent = createFeaturesPanel();
            } else if (tab.id === 'datamodify') {
                tabContent = createDataModifyPanel();
            } else if (tab.id === 'executor') {
                tabContent = createExecutorPanel();
            } else if (tab.id === 'logs') {
                tabContent = createLogPanel();
            }

            tabContents[tab.id] = tabContent;
            tabContent.style.display = tab.id === 'info' ? 'block' : 'none';
            content.appendChild(tabContent);
        });

        content.prepend(tabs);
        windowDiv.appendChild(content);

        // 窗口拖动
        let isDraggingWin = false;
        let winStartX, winStartY, winStartLeft, winStartTop;

        header.addEventListener('mousedown', (e) => {
            if (e.target === closeBtn) return;
            isDraggingWin = true;
            const rect = windowDiv.getBoundingClientRect();
            winStartX = e.clientX;
            winStartY = e.clientY;
            winStartLeft = rect.left;
            winStartTop = rect.top;
            windowDiv.style.cursor = 'grabbing';
            windowDiv.style.transform = 'none';
            e.preventDefault();
        });

        document.addEventListener('mousemove', (e) => {
            if (!isDraggingWin) return;
            const dx = e.clientX - winStartX;
            const dy = e.clientY - winStartY;
            windowDiv.style.left = (winStartLeft + dx) + 'px';
            windowDiv.style.top = (winStartTop + dy) + 'px';
            windowDiv.style.transform = 'none';
        });

        document.addEventListener('mouseup', () => {
            if (isDraggingWin) {
                isDraggingWin = false;
                windowDiv.style.cursor = 'default';
            }
        });

        document.body.appendChild(windowDiv);
        return windowDiv;
    }

    function toggleToolWindow() {
        if (!toolWindow) {
            toolWindow = createToolWindow();
        }
        if (isToolVisible) {
            toolWindow.style.display = 'none';
            isToolVisible = false;
        } else {
            toolWindow.style.display = 'flex';
            isToolVisible = true;
            setTimeout(() => {
                const refreshBtn = document.querySelector('#srt-info-content')?.parentElement?.querySelector('button');
                if (refreshBtn) refreshBtn.click();
            }, 500);
        }
    }

    // ==================== 初始化 ====================

    let ball = null;

    async function init() {
        if (document.querySelector('.csrt-ball')) {
            return;
        }

        setupBypassBlacklist();
        setupBlockCollaboration();
        setupProjectReplacer();
        setupFakeIdentity();
        setupFakePhone();

        registerMenuCommands();

        if (featureSettings.performanceMonitor) {
            setTimeout(() => {
                startMonitor();
            }, 2000);
        }

        requestAnimationFrame(async () => {
            ball = await createFloatingBall();

            document.addEventListener('keydown', (e) => {
                if (e.ctrlKey && e.shiftKey && e.key === 'E') {
                    e.preventDefault();
                    toggleToolWindow();
                }
            });

            setTimeout(() => {
                setupExtensionInterceptor();
            }, 100);

            setTimeout(async () => {
                try {
                    const info = await getProjectInfo(false);
                    if (info.customExtensions?.length > 0 || info.warnings?.length > 0) {
                        if (ball) {
                            ball.style.border = '2px solid #ff5555';
                            ball.style.animation = 'csrt-pulse 2s infinite';
                        }
                    }
                } catch (e) {
                    privateLog.addError('自动检测失败: ' + e.message);
                }
            }, 5000);
        });
    }

    init();

    // ==================== 暴露API ====================

    unsafeWindow.__CSRT = {
        version: SCRIPT_VERSION,
        name: SCRIPT_NAME,
        author: '110200',
        getProjectInfo: getProjectInfo,
        modifyExtensionCode: modifyExtensionCode,
        getExtensionCode: getExtensionCode,
        vmPromise: vmPromise,
        vmInstance: () => vmInstance,
        getVM: getVM,
        privateLog: privateLog,
        toggleTool: toggleToolWindow,
        setBrowserTitle: setBrowserTitle,
        resetBrowserTitle: resetBrowserTitle,
        extractProjectIdFromUrl: extractProjectIdFromUrl,
        extractCreatorInfo: extractCreatorInfo,
        extractUsernameFromTitle: extractUsernameFromTitle,
        featureSettings: featureSettings,
        phoneSettings: phoneSettings,
        saveSettings: saveSettings,
        loadSettings: loadSettings,
        showFilePrompt: showFilePrompt,
        blobToArrayBuffer: blobToArrayBuffer,
        hasCCWDataExtension: hasCCWDataExtension,
        hasGandiEconomyExtension: hasGandiEconomyExtension,
        downloadProject: downloadProject,
        getPageType: getPageType,
        startMonitor: startMonitor,
        stopMonitor: stopMonitor,
        toggleMonitor: toggleMonitor
    };

    window.addEventListener('beforeunload', () => {
        Object.keys(originalConsole).forEach(key => {
            console[key] = originalConsole[key];
        });
    });

})();
