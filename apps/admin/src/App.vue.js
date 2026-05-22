import { AlbumsOutline, EyeOffOutline, EyeOutline, KeyOutline, LogOutOutline, PeopleOutline, RefreshOutline, SettingsOutline, ShieldCheckmarkOutline, SpeedometerOutline, TrashOutline, } from "@vicons/ionicons5";
import { NAlert, NButton, NCard, NCheckbox, NConfigProvider, NDataTable, NEmpty, NForm, NFormItem, NIcon, NInput, NInputGroup, NLayout, NLayoutContent, NLayoutSider, NMenu, NModal, NSelect, NSpace, NSpin, NStatistic, NTag, zhCN, } from "naive-ui";
import { computed, h, onMounted, reactive, ref } from "vue";
import { adminApi } from "./admin-api";
import { supabase } from "./supabase";
const menuOptions = [
    { key: "overview", label: "总览", icon: renderIcon(SpeedometerOutline) },
    { key: "users", label: "用户管理", icon: renderIcon(PeopleOutline) },
    { key: "jobs", label: "生成记录", icon: renderIcon(AlbumsOutline) },
    { key: "settings", label: "系统配置", icon: renderIcon(SettingsOutline) },
    { key: "audit", label: "审计日志", icon: renderIcon(ShieldCheckmarkOutline) },
];
const editableSettings = [
    {
        key: "MODEL_PROVIDER",
        label: "三维供应商",
        secret: false,
        placeholder: "mock / hunyuan / meshy / neural4d",
    },
    {
        key: "IMAGE_PROVIDER",
        label: "图片供应商",
        secret: false,
        placeholder: "mock / siliconflow / openai",
    },
    {
        key: "CADAM_LLM_PROVIDER",
        label: "CADAM 模型通道",
        secret: false,
        placeholder: "mimo / openai",
    },
    {
        key: "PARAMCAD_ENGINE",
        label: "工程 CAD 引擎",
        secret: false,
        placeholder: "cad-script",
    },
    {
        key: "CAD_SCRIPT_GENERATOR",
        label: "CAD Script Generator",
        secret: false,
        placeholder: "local / llm",
    },
    {
        key: "CAD_SCRIPT_BASE_URL",
        label: "CAD Script Base URL",
        secret: false,
        placeholder: "https://api.deepseek.com",
    },
    {
        key: "CAD_SCRIPT_MODEL",
        label: "CAD Script Model",
        secret: false,
        placeholder: "deepseek-v4-pro",
    },
    {
        key: "CAD_SCRIPT_REPAIR",
        label: "CAD Script Repair",
        secret: false,
        placeholder: "true / false",
    },
    {
        key: "CAD_SCRIPT_API_KEY",
        label: "CAD Script API Key",
        secret: true,
        placeholder: "not configured",
    },
    {
        key: "OPENAI_IMAGE_MODEL",
        label: "OpenAI 图片模型",
        secret: false,
        placeholder: "gpt-image-2",
    },
    {
        key: "SILICONFLOW_IMAGE_MODEL",
        label: "SiliconFlow 图片模型",
        secret: false,
        placeholder: "Kwai-Kolors/Kolors",
    },
    {
        key: "MIMO_CHAT_MODEL",
        label: "MIMO 对话模型",
        secret: false,
        placeholder: "mimo-v2.5-pro",
    },
    {
        key: "OPENAI_API_KEY",
        label: "OpenAI API Key",
        secret: true,
        placeholder: "未配置",
    },
    {
        key: "SILICONFLOW_API_KEY",
        label: "SiliconFlow API Key",
        secret: true,
        placeholder: "未配置",
    },
    {
        key: "MIMO_API_KEY",
        label: "MIMO API Key",
        secret: true,
        placeholder: "未配置",
    },
    {
        key: "TENCENT_TOKENHUB_API_KEY",
        label: "Tencent TokenHub API Key",
        secret: true,
        placeholder: "未配置",
    },
];
const currentView = ref("overview");
const session = ref(null);
const authLoading = ref(true);
const loginLoading = ref(false);
const loading = ref(false);
const saving = ref(false);
const error = ref("");
const loginForm = reactive({ email: "", password: "" });
const summary = ref(null);
const users = ref([]);
const jobs = ref([]);
const settings = ref([]);
const auditLogs = ref([]);
const loadedViews = reactive({
    overview: false,
    users: false,
    jobs: false,
    settings: false,
    audit: false,
});
const jobFilters = reactive({
    kind: "",
    status: "",
    search: "",
    includeDeleted: false,
});
const formValues = reactive({});
const visibleSecrets = reactive({});
const confirmState = reactive({
    show: false,
    title: "",
    content: "",
    confirmText: "确认",
    action: null,
});
function renderIcon(icon) {
    return () => h(NIcon, null, { default: () => h(icon) });
}
const title = computed(() => {
    const current = menuOptions.find((item) => item.key === currentView.value);
    return String(current?.label ?? "总览");
});
const signedEmail = computed(() => session.value?.user.email ?? "管理员");
const recentFailedJobs = computed(() => summary.value?.recentJobs.filter((job) => job.status === "failed") ?? []);
const settingsByKey = computed(() => new Map(settings.value.map((item) => [item.key, item])));
const jobKindOptions = [
    { label: "全部类型", value: "" },
    { label: "三维", value: "3d" },
    { label: "图片", value: "image" },
    { label: "CADAM", value: "cadam" },
    { label: "工程 CAD", value: "paramcad" },
];
const jobStatusOptions = [
    { label: "全部状态", value: "" },
    { label: "排队", value: "queued" },
    { label: "运行中", value: "running" },
    { label: "后处理", value: "postprocessing" },
    { label: "已完成", value: "completed" },
    { label: "失败", value: "failed" },
];
const jobKindLabel = (kind) => {
    if (kind === "3d")
        return "三维";
    if (kind === "image")
        return "图片";
    if (kind === "cadam")
        return "CADAM";
    if (kind === "paramcad")
        return "工程 CAD";
    return kind;
};
function formatDate(value) {
    if (!value)
        return "-";
    return new Intl.DateTimeFormat("zh-CN", {
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
    }).format(new Date(value));
}
function statusLabel(status) {
    const labels = {
        queued: "排队",
        running: "运行中",
        postprocessing: "后处理",
        completed: "已完成",
        failed: "失败",
    };
    return labels[status] ?? status;
}
function statusType(status) {
    if (status === "completed")
        return "success";
    if (status === "failed")
        return "error";
    if (status === "running" || status === "postprocessing")
        return "warning";
    return "default";
}
function shortId(value) {
    if (!value)
        return "-";
    return value.length > 10 ? `${value.slice(0, 8)}...` : value;
}
function syncSettingForm(nextSettings) {
    for (const item of editableSettings) {
        const setting = nextSettings.find((entry) => entry.key === item.key);
        formValues[item.key] = setting?.value ?? "";
    }
}
async function loadOverview() {
    summary.value = await adminApi.summary();
    loadedViews.overview = true;
}
async function loadUsers() {
    users.value = (await adminApi.users()).users;
    loadedViews.users = true;
}
async function loadJobs() {
    jobs.value = (await adminApi.jobs({
        kind: jobFilters.kind || undefined,
        status: jobFilters.status || undefined,
        search: jobFilters.search || undefined,
        includeDeleted: jobFilters.includeDeleted,
    })).jobs;
    loadedViews.jobs = true;
}
async function loadSettings() {
    const result = await adminApi.settings();
    settings.value = result.settings;
    syncSettingForm(result.settings);
    loadedViews.settings = true;
}
async function loadAuditLogs() {
    auditLogs.value = (await adminApi.auditLogs()).logs;
    loadedViews.audit = true;
}
async function loadCurrent(force = false) {
    if (!session.value)
        return;
    if (!force && loadedViews[currentView.value])
        return;
    loading.value = true;
    error.value = "";
    try {
        if (currentView.value === "overview")
            await loadOverview();
        if (currentView.value === "users")
            await loadUsers();
        if (currentView.value === "jobs")
            await loadJobs();
        if (currentView.value === "settings")
            await loadSettings();
        if (currentView.value === "audit")
            await loadAuditLogs();
    }
    catch (caught) {
        error.value = caught instanceof Error ? caught.message : "加载失败";
    }
    finally {
        loading.value = false;
    }
}
async function selectView(key) {
    currentView.value = key;
    await loadCurrent();
}
async function login() {
    loginLoading.value = true;
    error.value = "";
    try {
        const { data, error: loginError } = await supabase.auth.signInWithPassword(loginForm);
        if (loginError)
            throw loginError;
        session.value = data.session;
        Object.keys(loadedViews).forEach((key) => {
            loadedViews[key] = false;
        });
        await loadOverview();
    }
    catch (caught) {
        error.value = caught instanceof Error ? caught.message : "登录失败";
    }
    finally {
        loginLoading.value = false;
    }
}
async function logout() {
    await supabase.auth.signOut();
    session.value = null;
    summary.value = null;
    users.value = [];
    jobs.value = [];
    settings.value = [];
    auditLogs.value = [];
}
function openConfirm(titleValue, content, confirmText, action) {
    confirmState.title = titleValue;
    confirmState.content = content;
    confirmState.confirmText = confirmText;
    confirmState.action = action;
    confirmState.show = true;
}
async function runConfirmed() {
    if (!confirmState.action)
        return;
    loading.value = true;
    error.value = "";
    try {
        await confirmState.action();
        confirmState.show = false;
    }
    catch (caught) {
        error.value = caught instanceof Error ? caught.message : "操作失败";
    }
    finally {
        loading.value = false;
    }
}
async function updateUser(user, action) {
    await adminApi.userAction(user.id, action);
    await loadUsers();
    loadedViews.overview = false;
}
async function deleteUser(user) {
    await adminApi.deleteUser(user.id);
    await loadUsers();
    loadedViews.overview = false;
}
async function updateJob(job, action) {
    await adminApi.jobAction(job.id, action);
    await loadJobs();
    loadedViews.overview = false;
}
async function deleteJob(job) {
    await adminApi.deleteJob(job.id);
    await loadJobs();
    loadedViews.overview = false;
}
async function saveSettings() {
    saving.value = true;
    error.value = "";
    try {
        const result = await adminApi.updateSettings(editableSettings.map((item) => ({
            key: item.key,
            value: formValues[item.key]?.trim() ? formValues[item.key].trim() : null,
            isSecret: item.secret,
        })));
        settings.value = result.settings;
        syncSettingForm(result.settings);
        loadedViews.overview = false;
    }
    catch (caught) {
        error.value = caught instanceof Error ? caught.message : "保存失败";
    }
    finally {
        saving.value = false;
    }
}
const userColumns = [
    { title: "邮箱", key: "email", minWidth: 220 },
    { title: "昵称", key: "username", minWidth: 120 },
    {
        title: "状态",
        key: "isBanned",
        width: 100,
        render: (row) => h(NTag, { type: row.isBanned ? "error" : "success", size: "small" }, { default: () => (row.isBanned ? "已禁用" : "正常") }),
    },
    {
        title: "最近登录",
        key: "lastSignInAt",
        width: 180,
        render: (row) => formatDate(row.lastSignInAt),
    },
    {
        title: "创建时间",
        key: "createdAt",
        width: 180,
        render: (row) => formatDate(row.createdAt),
    },
    {
        title: "操作",
        key: "actions",
        width: 220,
        render: (row) => h(NSpace, { size: 8 }, () => [
            h(NButton, {
                size: "small",
                type: row.isBanned ? "success" : "warning",
                onClick: () => void updateUser(row, row.isBanned ? "restore" : "disable"),
            }, { default: () => (row.isBanned ? "恢复" : "禁用") }),
            h(NButton, {
                size: "small",
                type: "error",
                secondary: true,
                onClick: () => openConfirm("硬删除用户", `将永久删除 ${row.email ?? row.id}，此操作不可恢复。`, "永久删除", () => deleteUser(row)),
            }, { default: () => "硬删除" }),
        ]),
    },
];
const jobColumns = [
    {
        title: "任务",
        key: "prompt",
        minWidth: 280,
        ellipsis: { tooltip: true },
    },
    {
        title: "类型",
        key: "kind",
        width: 90,
        render: (row) => jobKindLabel(row.kind),
    },
    {
        title: "状态",
        key: "status",
        width: 110,
        render: (row) => h(NTag, { type: statusType(row.status), size: "small" }, { default: () => statusLabel(row.status) }),
    },
    {
        title: "进度",
        key: "progress",
        width: 90,
        render: (row) => `${row.progress}%`,
    },
    {
        title: "用户",
        key: "userId",
        width: 130,
        render: (row) => shortId(row.userId),
    },
    {
        title: "创建时间",
        key: "createdAt",
        width: 180,
        render: (row) => formatDate(row.createdAt),
    },
    {
        title: "删除",
        key: "deletedAt",
        width: 100,
        render: (row) => row.deletedAt
            ? h(NTag, { type: "warning", size: "small" }, { default: () => "已删除" })
            : "-",
    },
    {
        title: "操作",
        key: "actions",
        width: 260,
        render: (row) => h(NSpace, { size: 8 }, () => [
            h(NButton, {
                size: "small",
                secondary: true,
                onClick: () => void updateJob(row, row.deletedAt ? "restore" : "soft_delete"),
            }, { default: () => (row.deletedAt ? "恢复" : "软删除") }),
            h(NButton, {
                size: "small",
                type: "primary",
                secondary: true,
                onClick: () => void updateJob(row, "retry"),
            }, { default: () => "重试" }),
            h(NButton, {
                size: "small",
                type: "error",
                secondary: true,
                onClick: () => openConfirm("硬删除生成记录", `将永久删除任务 ${row.id}，此操作不可恢复。`, "永久删除", () => deleteJob(row)),
            }, { default: () => "硬删除" }),
        ]),
    },
];
const auditColumns = [
    { title: "管理员", key: "adminEmail", minWidth: 180 },
    { title: "动作", key: "action", width: 160 },
    { title: "对象", key: "targetType", width: 120 },
    {
        title: "对象 ID",
        key: "targetId",
        width: 140,
        render: (row) => shortId(row.targetId),
    },
    {
        title: "摘要",
        key: "summary",
        minWidth: 240,
        ellipsis: { tooltip: true },
    },
    {
        title: "时间",
        key: "createdAt",
        width: 180,
        render: (row) => formatDate(row.createdAt),
    },
];
onMounted(async () => {
    const { data: { session: currentSession }, } = await supabase.auth.getSession();
    session.value = currentSession;
    authLoading.value = false;
    if (currentSession) {
        await loadOverview();
    }
    supabase.auth.onAuthStateChange((_event, nextSession) => {
        session.value = nextSession;
    });
});
const __VLS_ctx = {
    ...{},
    ...{},
};
let __VLS_components;
let __VLS_intrinsics;
let __VLS_directives;
let __VLS_0;
/** @ts-ignore @type { | typeof __VLS_components.NConfigProvider | typeof __VLS_components.NConfigProvider} */
NConfigProvider;
// @ts-ignore
const __VLS_1 = __VLS_asFunctionalComponent1(__VLS_0, new __VLS_0({
    locale: (__VLS_ctx.zhCN),
}));
const __VLS_2 = __VLS_1({
    locale: (__VLS_ctx.zhCN),
}, ...__VLS_functionalComponentArgsRest(__VLS_1));
var __VLS_5 = {};
const { default: __VLS_6 } = __VLS_3.slots;
__VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
    ...{ class: "admin-root" },
});
/** @type {__VLS_StyleScopedClasses['admin-root']} */ ;
if (__VLS_ctx.authLoading) {
    __VLS_asFunctionalElement1(__VLS_intrinsics.main, __VLS_intrinsics.main)({
        ...{ class: "center-screen" },
    });
    /** @type {__VLS_StyleScopedClasses['center-screen']} */ ;
    let __VLS_7;
    /** @ts-ignore @type { | typeof __VLS_components.NSpin} */
    NSpin;
    // @ts-ignore
    const __VLS_8 = __VLS_asFunctionalComponent1(__VLS_7, new __VLS_7({
        size: "large",
    }));
    const __VLS_9 = __VLS_8({
        size: "large",
    }, ...__VLS_functionalComponentArgsRest(__VLS_8));
}
else if (!__VLS_ctx.session) {
    __VLS_asFunctionalElement1(__VLS_intrinsics.main, __VLS_intrinsics.main)({
        ...{ class: "login-screen" },
    });
    /** @type {__VLS_StyleScopedClasses['login-screen']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.section, __VLS_intrinsics.section)({
        ...{ class: "login-panel" },
    });
    /** @type {__VLS_StyleScopedClasses['login-panel']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ class: "brand-mark" },
    });
    /** @type {__VLS_StyleScopedClasses['brand-mark']} */ ;
    let __VLS_12;
    /** @ts-ignore @type { | typeof __VLS_components.NIcon} */
    NIcon;
    // @ts-ignore
    const __VLS_13 = __VLS_asFunctionalComponent1(__VLS_12, new __VLS_12({
        component: (__VLS_ctx.ShieldCheckmarkOutline),
    }));
    const __VLS_14 = __VLS_13({
        component: (__VLS_ctx.ShieldCheckmarkOutline),
    }, ...__VLS_functionalComponentArgsRest(__VLS_13));
    __VLS_asFunctionalElement1(__VLS_intrinsics.h1, __VLS_intrinsics.h1)({});
    __VLS_asFunctionalElement1(__VLS_intrinsics.p, __VLS_intrinsics.p)({});
    if (__VLS_ctx.error) {
        let __VLS_17;
        /** @ts-ignore @type { | typeof __VLS_components.NAlert | typeof __VLS_components.NAlert} */
        NAlert;
        // @ts-ignore
        const __VLS_18 = __VLS_asFunctionalComponent1(__VLS_17, new __VLS_17({
            type: "error",
            bordered: (false),
            ...{ class: "login-alert" },
        }));
        const __VLS_19 = __VLS_18({
            type: "error",
            bordered: (false),
            ...{ class: "login-alert" },
        }, ...__VLS_functionalComponentArgsRest(__VLS_18));
        /** @type {__VLS_StyleScopedClasses['login-alert']} */ ;
        const { default: __VLS_22 } = __VLS_20.slots;
        (__VLS_ctx.error);
        // @ts-ignore
        [zhCN, authLoading, session, ShieldCheckmarkOutline, error, error,];
        var __VLS_20;
    }
    let __VLS_23;
    /** @ts-ignore @type { | typeof __VLS_components.NForm | typeof __VLS_components.NForm} */
    NForm;
    // @ts-ignore
    const __VLS_24 = __VLS_asFunctionalComponent1(__VLS_23, new __VLS_23({
        ...{ 'onSubmit': {} },
    }));
    const __VLS_25 = __VLS_24({
        ...{ 'onSubmit': {} },
    }, ...__VLS_functionalComponentArgsRest(__VLS_24));
    let __VLS_28;
    const __VLS_29 = ({ submit: {} },
        { onSubmit: (__VLS_ctx.login) });
    const { default: __VLS_30 } = __VLS_26.slots;
    let __VLS_31;
    /** @ts-ignore @type { | typeof __VLS_components.NFormItem | typeof __VLS_components.NFormItem} */
    NFormItem;
    // @ts-ignore
    const __VLS_32 = __VLS_asFunctionalComponent1(__VLS_31, new __VLS_31({
        label: "管理员邮箱",
    }));
    const __VLS_33 = __VLS_32({
        label: "管理员邮箱",
    }, ...__VLS_functionalComponentArgsRest(__VLS_32));
    const { default: __VLS_36 } = __VLS_34.slots;
    let __VLS_37;
    /** @ts-ignore @type { | typeof __VLS_components.NInput} */
    NInput;
    // @ts-ignore
    const __VLS_38 = __VLS_asFunctionalComponent1(__VLS_37, new __VLS_37({
        value: (__VLS_ctx.loginForm.email),
        placeholder: "admin@example.com",
        type: "text",
        size: "large",
    }));
    const __VLS_39 = __VLS_38({
        value: (__VLS_ctx.loginForm.email),
        placeholder: "admin@example.com",
        type: "text",
        size: "large",
    }, ...__VLS_functionalComponentArgsRest(__VLS_38));
    // @ts-ignore
    [login, loginForm,];
    var __VLS_34;
    let __VLS_42;
    /** @ts-ignore @type { | typeof __VLS_components.NFormItem | typeof __VLS_components.NFormItem} */
    NFormItem;
    // @ts-ignore
    const __VLS_43 = __VLS_asFunctionalComponent1(__VLS_42, new __VLS_42({
        label: "密码",
    }));
    const __VLS_44 = __VLS_43({
        label: "密码",
    }, ...__VLS_functionalComponentArgsRest(__VLS_43));
    const { default: __VLS_47 } = __VLS_45.slots;
    let __VLS_48;
    /** @ts-ignore @type { | typeof __VLS_components.NInput} */
    NInput;
    // @ts-ignore
    const __VLS_49 = __VLS_asFunctionalComponent1(__VLS_48, new __VLS_48({
        value: (__VLS_ctx.loginForm.password),
        placeholder: "请输入密码",
        type: "password",
        showPasswordOn: "click",
        size: "large",
    }));
    const __VLS_50 = __VLS_49({
        value: (__VLS_ctx.loginForm.password),
        placeholder: "请输入密码",
        type: "password",
        showPasswordOn: "click",
        size: "large",
    }, ...__VLS_functionalComponentArgsRest(__VLS_49));
    // @ts-ignore
    [loginForm,];
    var __VLS_45;
    let __VLS_53;
    /** @ts-ignore @type { | typeof __VLS_components.NButton | typeof __VLS_components.NButton} */
    NButton;
    // @ts-ignore
    const __VLS_54 = __VLS_asFunctionalComponent1(__VLS_53, new __VLS_53({
        type: "primary",
        attrType: "submit",
        block: true,
        size: "large",
        loading: (__VLS_ctx.loginLoading),
    }));
    const __VLS_55 = __VLS_54({
        type: "primary",
        attrType: "submit",
        block: true,
        size: "large",
        loading: (__VLS_ctx.loginLoading),
    }, ...__VLS_functionalComponentArgsRest(__VLS_54));
    const { default: __VLS_58 } = __VLS_56.slots;
    // @ts-ignore
    [loginLoading,];
    var __VLS_56;
    // @ts-ignore
    [];
    var __VLS_26;
    var __VLS_27;
}
else {
    let __VLS_59;
    /** @ts-ignore @type { | typeof __VLS_components.NLayout | typeof __VLS_components.NLayout} */
    NLayout;
    // @ts-ignore
    const __VLS_60 = __VLS_asFunctionalComponent1(__VLS_59, new __VLS_59({
        hasSider: true,
        ...{ class: "admin-layout" },
    }));
    const __VLS_61 = __VLS_60({
        hasSider: true,
        ...{ class: "admin-layout" },
    }, ...__VLS_functionalComponentArgsRest(__VLS_60));
    /** @type {__VLS_StyleScopedClasses['admin-layout']} */ ;
    const { default: __VLS_64 } = __VLS_62.slots;
    let __VLS_65;
    /** @ts-ignore @type { | typeof __VLS_components.NLayoutSider | typeof __VLS_components.NLayoutSider} */
    NLayoutSider;
    // @ts-ignore
    const __VLS_66 = __VLS_asFunctionalComponent1(__VLS_65, new __VLS_65({
        width: (248),
        bordered: true,
        ...{ class: "admin-sider" },
    }));
    const __VLS_67 = __VLS_66({
        width: (248),
        bordered: true,
        ...{ class: "admin-sider" },
    }, ...__VLS_functionalComponentArgsRest(__VLS_66));
    /** @type {__VLS_StyleScopedClasses['admin-sider']} */ ;
    const { default: __VLS_70 } = __VLS_68.slots;
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ class: "sider-brand" },
    });
    /** @type {__VLS_StyleScopedClasses['sider-brand']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ class: "brand-mark" },
    });
    /** @type {__VLS_StyleScopedClasses['brand-mark']} */ ;
    let __VLS_71;
    /** @ts-ignore @type { | typeof __VLS_components.NIcon} */
    NIcon;
    // @ts-ignore
    const __VLS_72 = __VLS_asFunctionalComponent1(__VLS_71, new __VLS_71({
        component: (__VLS_ctx.ShieldCheckmarkOutline),
    }));
    const __VLS_73 = __VLS_72({
        component: (__VLS_ctx.ShieldCheckmarkOutline),
    }, ...__VLS_functionalComponentArgsRest(__VLS_72));
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({});
    __VLS_asFunctionalElement1(__VLS_intrinsics.strong, __VLS_intrinsics.strong)({});
    __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({});
    let __VLS_76;
    /** @ts-ignore @type { | typeof __VLS_components.NMenu} */
    NMenu;
    // @ts-ignore
    const __VLS_77 = __VLS_asFunctionalComponent1(__VLS_76, new __VLS_76({
        ...{ 'onUpdate:value': {} },
        value: (__VLS_ctx.currentView),
        options: (__VLS_ctx.menuOptions),
        ...{ class: "admin-menu" },
    }));
    const __VLS_78 = __VLS_77({
        ...{ 'onUpdate:value': {} },
        value: (__VLS_ctx.currentView),
        options: (__VLS_ctx.menuOptions),
        ...{ class: "admin-menu" },
    }, ...__VLS_functionalComponentArgsRest(__VLS_77));
    let __VLS_81;
    const __VLS_82 = ({ 'update:value': {} },
        { 'onUpdate:value': (__VLS_ctx.selectView) });
    /** @type {__VLS_StyleScopedClasses['admin-menu']} */ ;
    var __VLS_79;
    var __VLS_80;
    // @ts-ignore
    [ShieldCheckmarkOutline, currentView, menuOptions, selectView,];
    var __VLS_68;
    let __VLS_83;
    /** @ts-ignore @type { | typeof __VLS_components.NLayoutContent | typeof __VLS_components.NLayoutContent} */
    NLayoutContent;
    // @ts-ignore
    const __VLS_84 = __VLS_asFunctionalComponent1(__VLS_83, new __VLS_83({
        ...{ class: "admin-content" },
    }));
    const __VLS_85 = __VLS_84({
        ...{ class: "admin-content" },
    }, ...__VLS_functionalComponentArgsRest(__VLS_84));
    /** @type {__VLS_StyleScopedClasses['admin-content']} */ ;
    const { default: __VLS_88 } = __VLS_86.slots;
    __VLS_asFunctionalElement1(__VLS_intrinsics.header, __VLS_intrinsics.header)({
        ...{ class: "topbar" },
    });
    /** @type {__VLS_StyleScopedClasses['topbar']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({});
    __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
        ...{ class: "eyebrow" },
    });
    /** @type {__VLS_StyleScopedClasses['eyebrow']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.h1, __VLS_intrinsics.h1)({});
    (__VLS_ctx.title);
    let __VLS_89;
    /** @ts-ignore @type { | typeof __VLS_components.NSpace | typeof __VLS_components.NSpace} */
    NSpace;
    // @ts-ignore
    const __VLS_90 = __VLS_asFunctionalComponent1(__VLS_89, new __VLS_89({
        align: "center",
    }));
    const __VLS_91 = __VLS_90({
        align: "center",
    }, ...__VLS_functionalComponentArgsRest(__VLS_90));
    const { default: __VLS_94 } = __VLS_92.slots;
    __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
        ...{ class: "signed-email" },
    });
    /** @type {__VLS_StyleScopedClasses['signed-email']} */ ;
    (__VLS_ctx.signedEmail);
    let __VLS_95;
    /** @ts-ignore @type { | typeof __VLS_components.NButton | typeof __VLS_components.NButton} */
    NButton;
    // @ts-ignore
    const __VLS_96 = __VLS_asFunctionalComponent1(__VLS_95, new __VLS_95({
        ...{ 'onClick': {} },
        circle: true,
        secondary: true,
        loading: (__VLS_ctx.loading),
    }));
    const __VLS_97 = __VLS_96({
        ...{ 'onClick': {} },
        circle: true,
        secondary: true,
        loading: (__VLS_ctx.loading),
    }, ...__VLS_functionalComponentArgsRest(__VLS_96));
    let __VLS_100;
    const __VLS_101 = ({ click: {} },
        { onClick: (...[$event]) => {
                if (!!(__VLS_ctx.authLoading))
                    return;
                if (!!(!__VLS_ctx.session))
                    return;
                __VLS_ctx.loadCurrent(true);
                // @ts-ignore
                [title, signedEmail, loading, loadCurrent,];
            } });
    const { default: __VLS_102 } = __VLS_98.slots;
    {
        const { icon: __VLS_103 } = __VLS_98.slots;
        let __VLS_104;
        /** @ts-ignore @type { | typeof __VLS_components.NIcon} */
        NIcon;
        // @ts-ignore
        const __VLS_105 = __VLS_asFunctionalComponent1(__VLS_104, new __VLS_104({
            component: (__VLS_ctx.RefreshOutline),
        }));
        const __VLS_106 = __VLS_105({
            component: (__VLS_ctx.RefreshOutline),
        }, ...__VLS_functionalComponentArgsRest(__VLS_105));
        // @ts-ignore
        [RefreshOutline,];
    }
    // @ts-ignore
    [];
    var __VLS_98;
    var __VLS_99;
    let __VLS_109;
    /** @ts-ignore @type { | typeof __VLS_components.NButton | typeof __VLS_components.NButton} */
    NButton;
    // @ts-ignore
    const __VLS_110 = __VLS_asFunctionalComponent1(__VLS_109, new __VLS_109({
        ...{ 'onClick': {} },
        secondary: true,
    }));
    const __VLS_111 = __VLS_110({
        ...{ 'onClick': {} },
        secondary: true,
    }, ...__VLS_functionalComponentArgsRest(__VLS_110));
    let __VLS_114;
    const __VLS_115 = ({ click: {} },
        { onClick: (__VLS_ctx.logout) });
    const { default: __VLS_116 } = __VLS_112.slots;
    {
        const { icon: __VLS_117 } = __VLS_112.slots;
        let __VLS_118;
        /** @ts-ignore @type { | typeof __VLS_components.NIcon} */
        NIcon;
        // @ts-ignore
        const __VLS_119 = __VLS_asFunctionalComponent1(__VLS_118, new __VLS_118({
            component: (__VLS_ctx.LogOutOutline),
        }));
        const __VLS_120 = __VLS_119({
            component: (__VLS_ctx.LogOutOutline),
        }, ...__VLS_functionalComponentArgsRest(__VLS_119));
        // @ts-ignore
        [logout, LogOutOutline,];
    }
    // @ts-ignore
    [];
    var __VLS_112;
    var __VLS_113;
    // @ts-ignore
    [];
    var __VLS_92;
    if (__VLS_ctx.error) {
        let __VLS_123;
        /** @ts-ignore @type { | typeof __VLS_components.NAlert | typeof __VLS_components.NAlert} */
        NAlert;
        // @ts-ignore
        const __VLS_124 = __VLS_asFunctionalComponent1(__VLS_123, new __VLS_123({
            type: "error",
            bordered: (false),
            ...{ class: "content-alert" },
        }));
        const __VLS_125 = __VLS_124({
            type: "error",
            bordered: (false),
            ...{ class: "content-alert" },
        }, ...__VLS_functionalComponentArgsRest(__VLS_124));
        /** @type {__VLS_StyleScopedClasses['content-alert']} */ ;
        const { default: __VLS_128 } = __VLS_126.slots;
        (__VLS_ctx.error);
        // @ts-ignore
        [error, error,];
        var __VLS_126;
    }
    let __VLS_129;
    /** @ts-ignore @type { | typeof __VLS_components.NSpin | typeof __VLS_components.NSpin} */
    NSpin;
    // @ts-ignore
    const __VLS_130 = __VLS_asFunctionalComponent1(__VLS_129, new __VLS_129({
        show: (__VLS_ctx.loading),
    }));
    const __VLS_131 = __VLS_130({
        show: (__VLS_ctx.loading),
    }, ...__VLS_functionalComponentArgsRest(__VLS_130));
    const { default: __VLS_134 } = __VLS_132.slots;
    if (__VLS_ctx.currentView === 'overview') {
        __VLS_asFunctionalElement1(__VLS_intrinsics.section, __VLS_intrinsics.section)({
            ...{ class: "view-stack" },
        });
        /** @type {__VLS_StyleScopedClasses['view-stack']} */ ;
        __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
            ...{ class: "metric-grid" },
        });
        /** @type {__VLS_StyleScopedClasses['metric-grid']} */ ;
        let __VLS_135;
        /** @ts-ignore @type { | typeof __VLS_components.NCard | typeof __VLS_components.NCard} */
        NCard;
        // @ts-ignore
        const __VLS_136 = __VLS_asFunctionalComponent1(__VLS_135, new __VLS_135({}));
        const __VLS_137 = __VLS_136({}, ...__VLS_functionalComponentArgsRest(__VLS_136));
        const { default: __VLS_140 } = __VLS_138.slots;
        let __VLS_141;
        /** @ts-ignore @type { | typeof __VLS_components.NStatistic} */
        NStatistic;
        // @ts-ignore
        const __VLS_142 = __VLS_asFunctionalComponent1(__VLS_141, new __VLS_141({
            label: "用户总数",
            value: (__VLS_ctx.summary?.totalUsers ?? 0),
        }));
        const __VLS_143 = __VLS_142({
            label: "用户总数",
            value: (__VLS_ctx.summary?.totalUsers ?? 0),
        }, ...__VLS_functionalComponentArgsRest(__VLS_142));
        // @ts-ignore
        [currentView, loading, summary,];
        var __VLS_138;
        let __VLS_146;
        /** @ts-ignore @type { | typeof __VLS_components.NCard | typeof __VLS_components.NCard} */
        NCard;
        // @ts-ignore
        const __VLS_147 = __VLS_asFunctionalComponent1(__VLS_146, new __VLS_146({}));
        const __VLS_148 = __VLS_147({}, ...__VLS_functionalComponentArgsRest(__VLS_147));
        const { default: __VLS_151 } = __VLS_149.slots;
        let __VLS_152;
        /** @ts-ignore @type { | typeof __VLS_components.NStatistic} */
        NStatistic;
        // @ts-ignore
        const __VLS_153 = __VLS_asFunctionalComponent1(__VLS_152, new __VLS_152({
            label: "生成总数",
            value: (__VLS_ctx.summary?.totalJobs ?? 0),
        }));
        const __VLS_154 = __VLS_153({
            label: "生成总数",
            value: (__VLS_ctx.summary?.totalJobs ?? 0),
        }, ...__VLS_functionalComponentArgsRest(__VLS_153));
        // @ts-ignore
        [summary,];
        var __VLS_149;
        let __VLS_157;
        /** @ts-ignore @type { | typeof __VLS_components.NCard | typeof __VLS_components.NCard} */
        NCard;
        // @ts-ignore
        const __VLS_158 = __VLS_asFunctionalComponent1(__VLS_157, new __VLS_157({}));
        const __VLS_159 = __VLS_158({}, ...__VLS_functionalComponentArgsRest(__VLS_158));
        const { default: __VLS_162 } = __VLS_160.slots;
        let __VLS_163;
        /** @ts-ignore @type { | typeof __VLS_components.NStatistic} */
        NStatistic;
        // @ts-ignore
        const __VLS_164 = __VLS_asFunctionalComponent1(__VLS_163, new __VLS_163({
            label: "运行中",
            value: (__VLS_ctx.summary?.runningJobs ?? 0),
        }));
        const __VLS_165 = __VLS_164({
            label: "运行中",
            value: (__VLS_ctx.summary?.runningJobs ?? 0),
        }, ...__VLS_functionalComponentArgsRest(__VLS_164));
        // @ts-ignore
        [summary,];
        var __VLS_160;
        let __VLS_168;
        /** @ts-ignore @type { | typeof __VLS_components.NCard | typeof __VLS_components.NCard} */
        NCard;
        // @ts-ignore
        const __VLS_169 = __VLS_asFunctionalComponent1(__VLS_168, new __VLS_168({}));
        const __VLS_170 = __VLS_169({}, ...__VLS_functionalComponentArgsRest(__VLS_169));
        const { default: __VLS_173 } = __VLS_171.slots;
        let __VLS_174;
        /** @ts-ignore @type { | typeof __VLS_components.NStatistic} */
        NStatistic;
        // @ts-ignore
        const __VLS_175 = __VLS_asFunctionalComponent1(__VLS_174, new __VLS_174({
            label: "失败任务",
            value: (__VLS_ctx.summary?.failedJobs ?? 0),
        }));
        const __VLS_176 = __VLS_175({
            label: "失败任务",
            value: (__VLS_ctx.summary?.failedJobs ?? 0),
        }, ...__VLS_functionalComponentArgsRest(__VLS_175));
        // @ts-ignore
        [summary,];
        var __VLS_171;
        let __VLS_179;
        /** @ts-ignore @type { | typeof __VLS_components.NCard | typeof __VLS_components.NCard} */
        NCard;
        // @ts-ignore
        const __VLS_180 = __VLS_asFunctionalComponent1(__VLS_179, new __VLS_179({}));
        const __VLS_181 = __VLS_180({}, ...__VLS_functionalComponentArgsRest(__VLS_180));
        const { default: __VLS_184 } = __VLS_182.slots;
        let __VLS_185;
        /** @ts-ignore @type { | typeof __VLS_components.NStatistic} */
        NStatistic;
        // @ts-ignore
        const __VLS_186 = __VLS_asFunctionalComponent1(__VLS_185, new __VLS_185({
            label: "工程 CAD",
            value: (__VLS_ctx.summary?.paramcadJobs ?? 0),
        }));
        const __VLS_187 = __VLS_186({
            label: "工程 CAD",
            value: (__VLS_ctx.summary?.paramcadJobs ?? 0),
        }, ...__VLS_functionalComponentArgsRest(__VLS_186));
        // @ts-ignore
        [summary,];
        var __VLS_182;
        let __VLS_190;
        /** @ts-ignore @type { | typeof __VLS_components.NCard | typeof __VLS_components.NCard} */
        NCard;
        // @ts-ignore
        const __VLS_191 = __VLS_asFunctionalComponent1(__VLS_190, new __VLS_190({
            title: "最近失败任务",
        }));
        const __VLS_192 = __VLS_191({
            title: "最近失败任务",
        }, ...__VLS_functionalComponentArgsRest(__VLS_191));
        const { default: __VLS_195 } = __VLS_193.slots;
        if (__VLS_ctx.recentFailedJobs.length === 0) {
            let __VLS_196;
            /** @ts-ignore @type { | typeof __VLS_components.NEmpty} */
            NEmpty;
            // @ts-ignore
            const __VLS_197 = __VLS_asFunctionalComponent1(__VLS_196, new __VLS_196({
                description: "暂无失败任务",
            }));
            const __VLS_198 = __VLS_197({
                description: "暂无失败任务",
            }, ...__VLS_functionalComponentArgsRest(__VLS_197));
        }
        else {
            __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
                ...{ class: "compact-list" },
            });
            /** @type {__VLS_StyleScopedClasses['compact-list']} */ ;
            for (const [job] of __VLS_vFor((__VLS_ctx.recentFailedJobs))) {
                __VLS_asFunctionalElement1(__VLS_intrinsics.article, __VLS_intrinsics.article)({
                    key: (job.id),
                });
                __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({});
                __VLS_asFunctionalElement1(__VLS_intrinsics.strong, __VLS_intrinsics.strong)({});
                (job.prompt);
                __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({});
                (job.error || "无错误详情");
                let __VLS_201;
                /** @ts-ignore @type { | typeof __VLS_components.NTag | typeof __VLS_components.NTag} */
                NTag;
                // @ts-ignore
                const __VLS_202 = __VLS_asFunctionalComponent1(__VLS_201, new __VLS_201({
                    type: "error",
                    size: "small",
                }));
                const __VLS_203 = __VLS_202({
                    type: "error",
                    size: "small",
                }, ...__VLS_functionalComponentArgsRest(__VLS_202));
                const { default: __VLS_206 } = __VLS_204.slots;
                (__VLS_ctx.formatDate(job.createdAt));
                // @ts-ignore
                [recentFailedJobs, recentFailedJobs, formatDate,];
                var __VLS_204;
                // @ts-ignore
                [];
            }
        }
        // @ts-ignore
        [];
        var __VLS_193;
        let __VLS_207;
        /** @ts-ignore @type { | typeof __VLS_components.NCard | typeof __VLS_components.NCard} */
        NCard;
        // @ts-ignore
        const __VLS_208 = __VLS_asFunctionalComponent1(__VLS_207, new __VLS_207({
            title: "最近生成记录",
        }));
        const __VLS_209 = __VLS_208({
            title: "最近生成记录",
        }, ...__VLS_functionalComponentArgsRest(__VLS_208));
        const { default: __VLS_212 } = __VLS_210.slots;
        let __VLS_213;
        /** @ts-ignore @type { | typeof __VLS_components.NDataTable} */
        NDataTable;
        // @ts-ignore
        const __VLS_214 = __VLS_asFunctionalComponent1(__VLS_213, new __VLS_213({
            columns: (__VLS_ctx.jobColumns.slice(0, 6)),
            data: (__VLS_ctx.summary?.recentJobs ?? []),
            pagination: ({ pageSize: 8 }),
            bordered: (false),
        }));
        const __VLS_215 = __VLS_214({
            columns: (__VLS_ctx.jobColumns.slice(0, 6)),
            data: (__VLS_ctx.summary?.recentJobs ?? []),
            pagination: ({ pageSize: 8 }),
            bordered: (false),
        }, ...__VLS_functionalComponentArgsRest(__VLS_214));
        // @ts-ignore
        [summary, jobColumns,];
        var __VLS_210;
    }
    if (__VLS_ctx.currentView === 'users') {
        __VLS_asFunctionalElement1(__VLS_intrinsics.section, __VLS_intrinsics.section)({
            ...{ class: "view-stack" },
        });
        /** @type {__VLS_StyleScopedClasses['view-stack']} */ ;
        let __VLS_218;
        /** @ts-ignore @type { | typeof __VLS_components.NCard | typeof __VLS_components.NCard} */
        NCard;
        // @ts-ignore
        const __VLS_219 = __VLS_asFunctionalComponent1(__VLS_218, new __VLS_218({
            title: "用户管理",
        }));
        const __VLS_220 = __VLS_219({
            title: "用户管理",
        }, ...__VLS_functionalComponentArgsRest(__VLS_219));
        const { default: __VLS_223 } = __VLS_221.slots;
        let __VLS_224;
        /** @ts-ignore @type { | typeof __VLS_components.NDataTable} */
        NDataTable;
        // @ts-ignore
        const __VLS_225 = __VLS_asFunctionalComponent1(__VLS_224, new __VLS_224({
            columns: (__VLS_ctx.userColumns),
            data: (__VLS_ctx.users),
            pagination: ({ pageSize: 12 }),
            bordered: (false),
            remote: true,
        }));
        const __VLS_226 = __VLS_225({
            columns: (__VLS_ctx.userColumns),
            data: (__VLS_ctx.users),
            pagination: ({ pageSize: 12 }),
            bordered: (false),
            remote: true,
        }, ...__VLS_functionalComponentArgsRest(__VLS_225));
        // @ts-ignore
        [currentView, userColumns, users,];
        var __VLS_221;
    }
    if (__VLS_ctx.currentView === 'jobs') {
        __VLS_asFunctionalElement1(__VLS_intrinsics.section, __VLS_intrinsics.section)({
            ...{ class: "view-stack" },
        });
        /** @type {__VLS_StyleScopedClasses['view-stack']} */ ;
        let __VLS_229;
        /** @ts-ignore @type { | typeof __VLS_components.NCard | typeof __VLS_components.NCard} */
        NCard;
        // @ts-ignore
        const __VLS_230 = __VLS_asFunctionalComponent1(__VLS_229, new __VLS_229({
            title: "生成记录",
        }));
        const __VLS_231 = __VLS_230({
            title: "生成记录",
        }, ...__VLS_functionalComponentArgsRest(__VLS_230));
        const { default: __VLS_234 } = __VLS_232.slots;
        __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
            ...{ class: "toolbar" },
        });
        /** @type {__VLS_StyleScopedClasses['toolbar']} */ ;
        let __VLS_235;
        /** @ts-ignore @type { | typeof __VLS_components.NInput} */
        NInput;
        // @ts-ignore
        const __VLS_236 = __VLS_asFunctionalComponent1(__VLS_235, new __VLS_235({
            value: (__VLS_ctx.jobFilters.search),
            placeholder: "搜索 prompt / 用户 ID",
            clearable: true,
        }));
        const __VLS_237 = __VLS_236({
            value: (__VLS_ctx.jobFilters.search),
            placeholder: "搜索 prompt / 用户 ID",
            clearable: true,
        }, ...__VLS_functionalComponentArgsRest(__VLS_236));
        let __VLS_240;
        /** @ts-ignore @type { | typeof __VLS_components.NSelect} */
        NSelect;
        // @ts-ignore
        const __VLS_241 = __VLS_asFunctionalComponent1(__VLS_240, new __VLS_240({
            value: (__VLS_ctx.jobFilters.kind),
            options: (__VLS_ctx.jobKindOptions),
            ...{ class: "filter-select" },
        }));
        const __VLS_242 = __VLS_241({
            value: (__VLS_ctx.jobFilters.kind),
            options: (__VLS_ctx.jobKindOptions),
            ...{ class: "filter-select" },
        }, ...__VLS_functionalComponentArgsRest(__VLS_241));
        /** @type {__VLS_StyleScopedClasses['filter-select']} */ ;
        let __VLS_245;
        /** @ts-ignore @type { | typeof __VLS_components.NSelect} */
        NSelect;
        // @ts-ignore
        const __VLS_246 = __VLS_asFunctionalComponent1(__VLS_245, new __VLS_245({
            value: (__VLS_ctx.jobFilters.status),
            options: (__VLS_ctx.jobStatusOptions),
            ...{ class: "filter-select" },
        }));
        const __VLS_247 = __VLS_246({
            value: (__VLS_ctx.jobFilters.status),
            options: (__VLS_ctx.jobStatusOptions),
            ...{ class: "filter-select" },
        }, ...__VLS_functionalComponentArgsRest(__VLS_246));
        /** @type {__VLS_StyleScopedClasses['filter-select']} */ ;
        let __VLS_250;
        /** @ts-ignore @type { | typeof __VLS_components.NCheckbox | typeof __VLS_components.NCheckbox} */
        NCheckbox;
        // @ts-ignore
        const __VLS_251 = __VLS_asFunctionalComponent1(__VLS_250, new __VLS_250({
            checked: (__VLS_ctx.jobFilters.includeDeleted),
        }));
        const __VLS_252 = __VLS_251({
            checked: (__VLS_ctx.jobFilters.includeDeleted),
        }, ...__VLS_functionalComponentArgsRest(__VLS_251));
        const { default: __VLS_255 } = __VLS_253.slots;
        // @ts-ignore
        [currentView, jobFilters, jobFilters, jobFilters, jobFilters, jobKindOptions, jobStatusOptions,];
        var __VLS_253;
        let __VLS_256;
        /** @ts-ignore @type { | typeof __VLS_components.NButton | typeof __VLS_components.NButton} */
        NButton;
        // @ts-ignore
        const __VLS_257 = __VLS_asFunctionalComponent1(__VLS_256, new __VLS_256({
            ...{ 'onClick': {} },
            type: "primary",
            secondary: true,
        }));
        const __VLS_258 = __VLS_257({
            ...{ 'onClick': {} },
            type: "primary",
            secondary: true,
        }, ...__VLS_functionalComponentArgsRest(__VLS_257));
        let __VLS_261;
        const __VLS_262 = ({ click: {} },
            { onClick: (__VLS_ctx.loadJobs) });
        const { default: __VLS_263 } = __VLS_259.slots;
        // @ts-ignore
        [loadJobs,];
        var __VLS_259;
        var __VLS_260;
        let __VLS_264;
        /** @ts-ignore @type { | typeof __VLS_components.NDataTable} */
        NDataTable;
        // @ts-ignore
        const __VLS_265 = __VLS_asFunctionalComponent1(__VLS_264, new __VLS_264({
            columns: (__VLS_ctx.jobColumns),
            data: (__VLS_ctx.jobs),
            pagination: ({ pageSize: 12 }),
            bordered: (false),
            remote: true,
        }));
        const __VLS_266 = __VLS_265({
            columns: (__VLS_ctx.jobColumns),
            data: (__VLS_ctx.jobs),
            pagination: ({ pageSize: 12 }),
            bordered: (false),
            remote: true,
        }, ...__VLS_functionalComponentArgsRest(__VLS_265));
        // @ts-ignore
        [jobColumns, jobs,];
        var __VLS_232;
    }
    if (__VLS_ctx.currentView === 'settings') {
        __VLS_asFunctionalElement1(__VLS_intrinsics.section, __VLS_intrinsics.section)({
            ...{ class: "view-stack" },
        });
        /** @type {__VLS_StyleScopedClasses['view-stack']} */ ;
        let __VLS_269;
        /** @ts-ignore @type { | typeof __VLS_components.NCard | typeof __VLS_components.NCard} */
        NCard;
        // @ts-ignore
        const __VLS_270 = __VLS_asFunctionalComponent1(__VLS_269, new __VLS_269({
            title: "系统配置",
        }));
        const __VLS_271 = __VLS_270({
            title: "系统配置",
        }, ...__VLS_functionalComponentArgsRest(__VLS_270));
        const { default: __VLS_274 } = __VLS_272.slots;
        __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
            ...{ class: "settings-grid" },
        });
        /** @type {__VLS_StyleScopedClasses['settings-grid']} */ ;
        for (const [item] of __VLS_vFor((__VLS_ctx.editableSettings))) {
            let __VLS_275;
            /** @ts-ignore @type { | typeof __VLS_components.NFormItem | typeof __VLS_components.NFormItem} */
            NFormItem;
            // @ts-ignore
            const __VLS_276 = __VLS_asFunctionalComponent1(__VLS_275, new __VLS_275({
                key: (item.key),
                label: (item.label),
            }));
            const __VLS_277 = __VLS_276({
                key: (item.key),
                label: (item.label),
            }, ...__VLS_functionalComponentArgsRest(__VLS_276));
            const { default: __VLS_280 } = __VLS_278.slots;
            if (item.secret) {
                let __VLS_281;
                /** @ts-ignore @type { | typeof __VLS_components.NInputGroup | typeof __VLS_components.NInputGroup} */
                NInputGroup;
                // @ts-ignore
                const __VLS_282 = __VLS_asFunctionalComponent1(__VLS_281, new __VLS_281({}));
                const __VLS_283 = __VLS_282({}, ...__VLS_functionalComponentArgsRest(__VLS_282));
                const { default: __VLS_286 } = __VLS_284.slots;
                let __VLS_287;
                /** @ts-ignore @type { | typeof __VLS_components.NInput} */
                NInput;
                // @ts-ignore
                const __VLS_288 = __VLS_asFunctionalComponent1(__VLS_287, new __VLS_287({
                    value: (__VLS_ctx.formValues[item.key]),
                    type: (__VLS_ctx.visibleSecrets[item.key] ? 'text' : 'password'),
                    placeholder: (item.placeholder),
                    showPasswordOn: "click",
                }));
                const __VLS_289 = __VLS_288({
                    value: (__VLS_ctx.formValues[item.key]),
                    type: (__VLS_ctx.visibleSecrets[item.key] ? 'text' : 'password'),
                    placeholder: (item.placeholder),
                    showPasswordOn: "click",
                }, ...__VLS_functionalComponentArgsRest(__VLS_288));
                let __VLS_292;
                /** @ts-ignore @type { | typeof __VLS_components.NButton | typeof __VLS_components.NButton} */
                NButton;
                // @ts-ignore
                const __VLS_293 = __VLS_asFunctionalComponent1(__VLS_292, new __VLS_292({
                    ...{ 'onClick': {} },
                    secondary: true,
                    ...{ class: "eye-button" },
                }));
                const __VLS_294 = __VLS_293({
                    ...{ 'onClick': {} },
                    secondary: true,
                    ...{ class: "eye-button" },
                }, ...__VLS_functionalComponentArgsRest(__VLS_293));
                let __VLS_297;
                const __VLS_298 = ({ click: {} },
                    { onClick: (...[$event]) => {
                            if (!!(__VLS_ctx.authLoading))
                                return;
                            if (!!(!__VLS_ctx.session))
                                return;
                            if (!(__VLS_ctx.currentView === 'settings'))
                                return;
                            if (!(item.secret))
                                return;
                            __VLS_ctx.visibleSecrets[item.key] = !__VLS_ctx.visibleSecrets[item.key];
                            // @ts-ignore
                            [currentView, editableSettings, formValues, visibleSecrets, visibleSecrets, visibleSecrets,];
                        } });
                /** @type {__VLS_StyleScopedClasses['eye-button']} */ ;
                const { default: __VLS_299 } = __VLS_295.slots;
                let __VLS_300;
                /** @ts-ignore @type { | typeof __VLS_components.NIcon} */
                NIcon;
                // @ts-ignore
                const __VLS_301 = __VLS_asFunctionalComponent1(__VLS_300, new __VLS_300({
                    component: (__VLS_ctx.visibleSecrets[item.key] ? __VLS_ctx.EyeOffOutline : __VLS_ctx.EyeOutline),
                }));
                const __VLS_302 = __VLS_301({
                    component: (__VLS_ctx.visibleSecrets[item.key] ? __VLS_ctx.EyeOffOutline : __VLS_ctx.EyeOutline),
                }, ...__VLS_functionalComponentArgsRest(__VLS_301));
                // @ts-ignore
                [visibleSecrets, EyeOffOutline, EyeOutline,];
                var __VLS_295;
                var __VLS_296;
                // @ts-ignore
                [];
                var __VLS_284;
            }
            else {
                let __VLS_305;
                /** @ts-ignore @type { | typeof __VLS_components.NInput} */
                NInput;
                // @ts-ignore
                const __VLS_306 = __VLS_asFunctionalComponent1(__VLS_305, new __VLS_305({
                    value: (__VLS_ctx.formValues[item.key]),
                    placeholder: (item.placeholder),
                }));
                const __VLS_307 = __VLS_306({
                    value: (__VLS_ctx.formValues[item.key]),
                    placeholder: (item.placeholder),
                }, ...__VLS_functionalComponentArgsRest(__VLS_306));
            }
            __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
                ...{ class: "setting-meta" },
            });
            /** @type {__VLS_StyleScopedClasses['setting-meta']} */ ;
            (__VLS_ctx.settingsByKey.get(item.key)?.isConfigured
                ? `已配置，更新于 ${__VLS_ctx.formatDate(__VLS_ctx.settingsByKey.get(item.key)?.updatedAt)}`
                : "未配置");
            // @ts-ignore
            [formatDate, formValues, settingsByKey, settingsByKey,];
            var __VLS_278;
            // @ts-ignore
            [];
        }
        __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
            ...{ class: "settings-actions" },
        });
        /** @type {__VLS_StyleScopedClasses['settings-actions']} */ ;
        let __VLS_310;
        /** @ts-ignore @type { | typeof __VLS_components.NButton | typeof __VLS_components.NButton} */
        NButton;
        // @ts-ignore
        const __VLS_311 = __VLS_asFunctionalComponent1(__VLS_310, new __VLS_310({
            ...{ 'onClick': {} },
            type: "primary",
            loading: (__VLS_ctx.saving),
        }));
        const __VLS_312 = __VLS_311({
            ...{ 'onClick': {} },
            type: "primary",
            loading: (__VLS_ctx.saving),
        }, ...__VLS_functionalComponentArgsRest(__VLS_311));
        let __VLS_315;
        const __VLS_316 = ({ click: {} },
            { onClick: (__VLS_ctx.saveSettings) });
        const { default: __VLS_317 } = __VLS_313.slots;
        {
            const { icon: __VLS_318 } = __VLS_313.slots;
            let __VLS_319;
            /** @ts-ignore @type { | typeof __VLS_components.NIcon} */
            NIcon;
            // @ts-ignore
            const __VLS_320 = __VLS_asFunctionalComponent1(__VLS_319, new __VLS_319({
                component: (__VLS_ctx.KeyOutline),
            }));
            const __VLS_321 = __VLS_320({
                component: (__VLS_ctx.KeyOutline),
            }, ...__VLS_functionalComponentArgsRest(__VLS_320));
            // @ts-ignore
            [saving, saveSettings, KeyOutline,];
        }
        // @ts-ignore
        [];
        var __VLS_313;
        var __VLS_314;
        // @ts-ignore
        [];
        var __VLS_272;
    }
    if (__VLS_ctx.currentView === 'audit') {
        __VLS_asFunctionalElement1(__VLS_intrinsics.section, __VLS_intrinsics.section)({
            ...{ class: "view-stack" },
        });
        /** @type {__VLS_StyleScopedClasses['view-stack']} */ ;
        let __VLS_324;
        /** @ts-ignore @type { | typeof __VLS_components.NCard | typeof __VLS_components.NCard} */
        NCard;
        // @ts-ignore
        const __VLS_325 = __VLS_asFunctionalComponent1(__VLS_324, new __VLS_324({
            title: "审计日志",
        }));
        const __VLS_326 = __VLS_325({
            title: "审计日志",
        }, ...__VLS_functionalComponentArgsRest(__VLS_325));
        const { default: __VLS_329 } = __VLS_327.slots;
        let __VLS_330;
        /** @ts-ignore @type { | typeof __VLS_components.NDataTable} */
        NDataTable;
        // @ts-ignore
        const __VLS_331 = __VLS_asFunctionalComponent1(__VLS_330, new __VLS_330({
            columns: (__VLS_ctx.auditColumns),
            data: (__VLS_ctx.auditLogs),
            pagination: ({ pageSize: 14 }),
            bordered: (false),
            remote: true,
        }));
        const __VLS_332 = __VLS_331({
            columns: (__VLS_ctx.auditColumns),
            data: (__VLS_ctx.auditLogs),
            pagination: ({ pageSize: 14 }),
            bordered: (false),
            remote: true,
        }, ...__VLS_functionalComponentArgsRest(__VLS_331));
        // @ts-ignore
        [currentView, auditColumns, auditLogs,];
        var __VLS_327;
    }
    // @ts-ignore
    [];
    var __VLS_132;
    // @ts-ignore
    [];
    var __VLS_86;
    // @ts-ignore
    [];
    var __VLS_62;
}
let __VLS_335;
/** @ts-ignore @type { | typeof __VLS_components.NModal | typeof __VLS_components.NModal} */
NModal;
// @ts-ignore
const __VLS_336 = __VLS_asFunctionalComponent1(__VLS_335, new __VLS_335({
    ...{ 'onPositiveClick': {} },
    show: (__VLS_ctx.confirmState.show),
    preset: "dialog",
    type: "error",
    title: (__VLS_ctx.confirmState.title),
    positiveText: (__VLS_ctx.confirmState.confirmText),
    negativeText: "取消",
}));
const __VLS_337 = __VLS_336({
    ...{ 'onPositiveClick': {} },
    show: (__VLS_ctx.confirmState.show),
    preset: "dialog",
    type: "error",
    title: (__VLS_ctx.confirmState.title),
    positiveText: (__VLS_ctx.confirmState.confirmText),
    negativeText: "取消",
}, ...__VLS_functionalComponentArgsRest(__VLS_336));
let __VLS_340;
const __VLS_341 = ({ positiveClick: {} },
    { onPositiveClick: (__VLS_ctx.runConfirmed) });
const { default: __VLS_342 } = __VLS_338.slots;
{
    const { icon: __VLS_343 } = __VLS_338.slots;
    let __VLS_344;
    /** @ts-ignore @type { | typeof __VLS_components.NIcon} */
    NIcon;
    // @ts-ignore
    const __VLS_345 = __VLS_asFunctionalComponent1(__VLS_344, new __VLS_344({
        component: (__VLS_ctx.TrashOutline),
    }));
    const __VLS_346 = __VLS_345({
        component: (__VLS_ctx.TrashOutline),
    }, ...__VLS_functionalComponentArgsRest(__VLS_345));
    // @ts-ignore
    [confirmState, confirmState, confirmState, runConfirmed, TrashOutline,];
}
(__VLS_ctx.confirmState.content);
// @ts-ignore
[confirmState,];
var __VLS_338;
var __VLS_339;
// @ts-ignore
[];
var __VLS_3;
// @ts-ignore
[];
const __VLS_export = (await import('vue')).defineComponent({});
export default {};
