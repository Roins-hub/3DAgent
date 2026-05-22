<script setup lang="ts">
import {
  AlbumsOutline,
  EyeOffOutline,
  EyeOutline,
  KeyOutline,
  LogOutOutline,
  PeopleOutline,
  RefreshOutline,
  SettingsOutline,
  ShieldCheckmarkOutline,
  SpeedometerOutline,
  TrashOutline,
} from "@vicons/ionicons5";
import type { Session } from "@supabase/supabase-js";
import {
  NAlert,
  NButton,
  NCard,
  NCheckbox,
  NConfigProvider,
  NDataTable,
  NEmpty,
  NForm,
  NFormItem,
  NIcon,
  NInput,
  NInputGroup,
  NLayout,
  NLayoutContent,
  NLayoutSider,
  NMenu,
  NModal,
  NSelect,
  NSpace,
  NSpin,
  NStatistic,
  NTag,
  zhCN,
} from "naive-ui";
import type { DataTableColumns, MenuOption } from "naive-ui";
import { computed, h, onMounted, reactive, ref } from "vue";
import { adminApi } from "./admin-api";
import { supabase } from "./supabase";
import type {
  AdminAuditLog,
  AdminGenerationJob,
  AdminSetting,
  AdminSummary,
  AdminUser,
  AdminView,
} from "./types";

const menuOptions: MenuOption[] = [
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
] as const;

const currentView = ref<AdminView>("overview");
const session = ref<Session | null>(null);
const authLoading = ref(true);
const loginLoading = ref(false);
const loading = ref(false);
const saving = ref(false);
const error = ref("");
const loginForm = reactive({ email: "", password: "" });
const summary = ref<AdminSummary | null>(null);
const users = ref<AdminUser[]>([]);
const jobs = ref<AdminGenerationJob[]>([]);
const settings = ref<AdminSetting[]>([]);
const auditLogs = ref<AdminAuditLog[]>([]);
const loadedViews = reactive<Record<AdminView, boolean>>({
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
const formValues = reactive<Record<string, string>>({});
const visibleSecrets = reactive<Record<string, boolean>>({});
const confirmState = reactive<{
  show: boolean;
  title: string;
  content: string;
  confirmText: string;
  action: null | (() => Promise<void>);
}>({
  show: false,
  title: "",
  content: "",
  confirmText: "确认",
  action: null,
});

function renderIcon(icon: unknown) {
  return () => h(NIcon, null, { default: () => h(icon as never) });
}

const title = computed(() => {
  const current = menuOptions.find((item) => item.key === currentView.value);
  return String(current?.label ?? "总览");
});

const signedEmail = computed(() => session.value?.user.email ?? "管理员");

const recentFailedJobs = computed(
  () => summary.value?.recentJobs.filter((job) => job.status === "failed") ?? [],
);

const settingsByKey = computed(
  () => new Map(settings.value.map((item) => [item.key, item])),
);

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

const jobKindLabel = (kind: AdminGenerationJob["kind"]) => {
  if (kind === "3d") return "三维";
  if (kind === "image") return "图片";
  if (kind === "cadam") return "CADAM";
  if (kind === "paramcad") return "工程 CAD";
  return kind;
};

function formatDate(value: string | null | undefined) {
  if (!value) return "-";
  return new Intl.DateTimeFormat("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function statusLabel(status: string) {
  const labels: Record<string, string> = {
    queued: "排队",
    running: "运行中",
    postprocessing: "后处理",
    completed: "已完成",
    failed: "失败",
  };
  return labels[status] ?? status;
}

function statusType(status: string) {
  if (status === "completed") return "success";
  if (status === "failed") return "error";
  if (status === "running" || status === "postprocessing") return "warning";
  return "default";
}

function shortId(value: string | null | undefined) {
  if (!value) return "-";
  return value.length > 10 ? `${value.slice(0, 8)}...` : value;
}

function syncSettingForm(nextSettings: AdminSetting[]) {
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
  jobs.value = (
    await adminApi.jobs({
      kind: jobFilters.kind || undefined,
      status: jobFilters.status || undefined,
      search: jobFilters.search || undefined,
      includeDeleted: jobFilters.includeDeleted,
    })
  ).jobs;
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
  if (!session.value) return;
  if (!force && loadedViews[currentView.value]) return;

  loading.value = true;
  error.value = "";
  try {
    if (currentView.value === "overview") await loadOverview();
    if (currentView.value === "users") await loadUsers();
    if (currentView.value === "jobs") await loadJobs();
    if (currentView.value === "settings") await loadSettings();
    if (currentView.value === "audit") await loadAuditLogs();
  } catch (caught) {
    error.value = caught instanceof Error ? caught.message : "加载失败";
  } finally {
    loading.value = false;
  }
}

async function selectView(key: string) {
  currentView.value = key as AdminView;
  await loadCurrent();
}

async function login() {
  loginLoading.value = true;
  error.value = "";
  try {
    const { data, error: loginError } =
      await supabase.auth.signInWithPassword(loginForm);
    if (loginError) throw loginError;
    session.value = data.session;
    Object.keys(loadedViews).forEach((key) => {
      loadedViews[key as AdminView] = false;
    });
    await loadOverview();
  } catch (caught) {
    error.value = caught instanceof Error ? caught.message : "登录失败";
  } finally {
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

function openConfirm(
  titleValue: string,
  content: string,
  confirmText: string,
  action: () => Promise<void>,
) {
  confirmState.title = titleValue;
  confirmState.content = content;
  confirmState.confirmText = confirmText;
  confirmState.action = action;
  confirmState.show = true;
}

async function runConfirmed() {
  if (!confirmState.action) return;
  loading.value = true;
  error.value = "";
  try {
    await confirmState.action();
    confirmState.show = false;
  } catch (caught) {
    error.value = caught instanceof Error ? caught.message : "操作失败";
  } finally {
    loading.value = false;
  }
}

async function updateUser(user: AdminUser, action: "disable" | "restore") {
  await adminApi.userAction(user.id, action);
  await loadUsers();
  loadedViews.overview = false;
}

async function deleteUser(user: AdminUser) {
  await adminApi.deleteUser(user.id);
  await loadUsers();
  loadedViews.overview = false;
}

async function updateJob(
  job: AdminGenerationJob,
  action: "soft_delete" | "restore" | "retry",
) {
  await adminApi.jobAction(job.id, action);
  await loadJobs();
  loadedViews.overview = false;
}

async function deleteJob(job: AdminGenerationJob) {
  await adminApi.deleteJob(job.id);
  await loadJobs();
  loadedViews.overview = false;
}

async function saveSettings() {
  saving.value = true;
  error.value = "";
  try {
    const result = await adminApi.updateSettings(
      editableSettings.map((item) => ({
        key: item.key,
        value: formValues[item.key]?.trim() ? formValues[item.key].trim() : null,
        isSecret: item.secret,
      })),
    );
    settings.value = result.settings;
    syncSettingForm(result.settings);
    loadedViews.overview = false;
  } catch (caught) {
    error.value = caught instanceof Error ? caught.message : "保存失败";
  } finally {
    saving.value = false;
  }
}

const userColumns: DataTableColumns<AdminUser> = [
  { title: "邮箱", key: "email", minWidth: 220 },
  { title: "昵称", key: "username", minWidth: 120 },
  {
    title: "状态",
    key: "isBanned",
    width: 100,
    render: (row) =>
      h(
        NTag,
        { type: row.isBanned ? "error" : "success", size: "small" },
        { default: () => (row.isBanned ? "已禁用" : "正常") },
      ),
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
    render: (row) =>
      h(NSpace, { size: 8 }, () => [
        h(
          NButton,
          {
            size: "small",
            type: row.isBanned ? "success" : "warning",
            onClick: () => void updateUser(row, row.isBanned ? "restore" : "disable"),
          },
          { default: () => (row.isBanned ? "恢复" : "禁用") },
        ),
        h(
          NButton,
          {
            size: "small",
            type: "error",
            secondary: true,
            onClick: () =>
              openConfirm(
                "硬删除用户",
                `将永久删除 ${row.email ?? row.id}，此操作不可恢复。`,
                "永久删除",
                () => deleteUser(row),
              ),
          },
          { default: () => "硬删除" },
        ),
      ]),
  },
];

const jobColumns: DataTableColumns<AdminGenerationJob> = [
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
    render: (row) =>
      h(
        NTag,
        { type: statusType(row.status), size: "small" },
        { default: () => statusLabel(row.status) },
      ),
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
    render: (row) =>
      row.deletedAt
        ? h(NTag, { type: "warning", size: "small" }, { default: () => "已删除" })
        : "-",
  },
  {
    title: "操作",
    key: "actions",
    width: 260,
    render: (row) =>
      h(NSpace, { size: 8 }, () => [
        h(
          NButton,
          {
            size: "small",
            secondary: true,
            onClick: () => void updateJob(row, row.deletedAt ? "restore" : "soft_delete"),
          },
          { default: () => (row.deletedAt ? "恢复" : "软删除") },
        ),
        h(
          NButton,
          {
            size: "small",
            type: "primary",
            secondary: true,
            onClick: () => void updateJob(row, "retry"),
          },
          { default: () => "重试" },
        ),
        h(
          NButton,
          {
            size: "small",
            type: "error",
            secondary: true,
            onClick: () =>
              openConfirm(
                "硬删除生成记录",
                `将永久删除任务 ${row.id}，此操作不可恢复。`,
                "永久删除",
                () => deleteJob(row),
              ),
          },
          { default: () => "硬删除" },
        ),
      ]),
  },
];

const auditColumns: DataTableColumns<AdminAuditLog> = [
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
  const {
    data: { session: currentSession },
  } = await supabase.auth.getSession();
  session.value = currentSession;
  authLoading.value = false;
  if (currentSession) {
    await loadOverview();
  }

  supabase.auth.onAuthStateChange((_event, nextSession) => {
    session.value = nextSession;
  });
});
</script>

<template>
  <NConfigProvider :locale="zhCN">
    <div class="admin-root">
      <main v-if="authLoading" class="center-screen">
        <NSpin size="large" />
      </main>

      <main v-else-if="!session" class="login-screen">
        <section class="login-panel">
          <div class="brand-mark">
            <NIcon :component="ShieldCheckmarkOutline" />
          </div>
          <h1>智模后台</h1>
          <p>独立管理控制台，登录态与前台用户端隔离。</p>
          <NAlert v-if="error" type="error" :bordered="false" class="login-alert">
            {{ error }}
          </NAlert>
          <NForm @submit.prevent="login">
            <NFormItem label="管理员邮箱">
              <NInput
                v-model:value="loginForm.email"
                placeholder="admin@example.com"
                type="text"
                size="large"
              />
            </NFormItem>
            <NFormItem label="密码">
              <NInput
                v-model:value="loginForm.password"
                placeholder="请输入密码"
                type="password"
                show-password-on="click"
                size="large"
              />
            </NFormItem>
            <NButton
              type="primary"
              attr-type="submit"
              block
              size="large"
              :loading="loginLoading"
            >
              登录后台
            </NButton>
          </NForm>
        </section>
      </main>

      <NLayout v-else has-sider class="admin-layout">
        <NLayoutSider :width="248" bordered class="admin-sider">
          <div class="sider-brand">
            <div class="brand-mark">
              <NIcon :component="ShieldCheckmarkOutline" />
            </div>
            <div>
              <strong>智模后台</strong>
              <span>内部运维控制台</span>
            </div>
          </div>
          <NMenu
            :value="currentView"
            :options="menuOptions"
            class="admin-menu"
            @update:value="selectView"
          />
        </NLayoutSider>

        <NLayoutContent class="admin-content">
          <header class="topbar">
            <div>
              <span class="eyebrow">Admin Console</span>
              <h1>{{ title }}</h1>
            </div>
            <NSpace align="center">
              <span class="signed-email">{{ signedEmail }}</span>
              <NButton circle secondary :loading="loading" @click="loadCurrent(true)">
                <template #icon>
                  <NIcon :component="RefreshOutline" />
                </template>
              </NButton>
              <NButton secondary @click="logout">
                <template #icon>
                  <NIcon :component="LogOutOutline" />
                </template>
                退出后台
              </NButton>
            </NSpace>
          </header>

          <NAlert v-if="error" type="error" :bordered="false" class="content-alert">
            {{ error }}
          </NAlert>

          <NSpin :show="loading">
            <section v-if="currentView === 'overview'" class="view-stack">
              <div class="metric-grid">
                <NCard>
                  <NStatistic label="用户总数" :value="summary?.totalUsers ?? 0" />
                </NCard>
                <NCard>
                  <NStatistic label="生成总数" :value="summary?.totalJobs ?? 0" />
                </NCard>
                <NCard>
                  <NStatistic label="运行中" :value="summary?.runningJobs ?? 0" />
                </NCard>
                <NCard>
                  <NStatistic label="失败任务" :value="summary?.failedJobs ?? 0" />
                </NCard>
                <NCard>
                  <NStatistic label="工程 CAD" :value="summary?.paramcadJobs ?? 0" />
                </NCard>
              </div>
              <NCard title="最近失败任务">
                <NEmpty v-if="recentFailedJobs.length === 0" description="暂无失败任务" />
                <div v-else class="compact-list">
                  <article v-for="job in recentFailedJobs" :key="job.id">
                    <div>
                      <strong>{{ job.prompt }}</strong>
                      <span>{{ job.error || "无错误详情" }}</span>
                    </div>
                    <NTag type="error" size="small">{{ formatDate(job.createdAt) }}</NTag>
                  </article>
                </div>
              </NCard>
              <NCard title="最近生成记录">
                <NDataTable
                  :columns="jobColumns.slice(0, 6)"
                  :data="summary?.recentJobs ?? []"
                  :pagination="{ pageSize: 8 }"
                  :bordered="false"
                />
              </NCard>
            </section>

            <section v-if="currentView === 'users'" class="view-stack">
              <NCard title="用户管理">
                <NDataTable
                  :columns="userColumns"
                  :data="users"
                  :pagination="{ pageSize: 12 }"
                  :bordered="false"
                  remote
                />
              </NCard>
            </section>

            <section v-if="currentView === 'jobs'" class="view-stack">
              <NCard title="生成记录">
                <div class="toolbar">
                  <NInput
                    v-model:value="jobFilters.search"
                    placeholder="搜索 prompt / 用户 ID"
                    clearable
                  />
                  <NSelect
                    v-model:value="jobFilters.kind"
                    :options="jobKindOptions"
                    class="filter-select"
                  />
                  <NSelect
                    v-model:value="jobFilters.status"
                    :options="jobStatusOptions"
                    class="filter-select"
                  />
                  <NCheckbox v-model:checked="jobFilters.includeDeleted">
                    包含已删除
                  </NCheckbox>
                  <NButton type="primary" secondary @click="loadJobs">筛选</NButton>
                </div>
                <NDataTable
                  :columns="jobColumns"
                  :data="jobs"
                  :pagination="{ pageSize: 12 }"
                  :bordered="false"
                  remote
                />
              </NCard>
            </section>

            <section v-if="currentView === 'settings'" class="view-stack">
              <NCard title="系统配置">
                <div class="settings-grid">
                  <NFormItem
                    v-for="item in editableSettings"
                    :key="item.key"
                    :label="item.label"
                  >
                    <template v-if="item.secret">
                      <NInputGroup>
                        <NInput
                          v-model:value="formValues[item.key]"
                          :type="visibleSecrets[item.key] ? 'text' : 'password'"
                          :placeholder="item.placeholder"
                          show-password-on="click"
                        />
                        <NButton
                          secondary
                          class="eye-button"
                          @click="visibleSecrets[item.key] = !visibleSecrets[item.key]"
                        >
                          <NIcon
                            :component="
                              visibleSecrets[item.key] ? EyeOffOutline : EyeOutline
                            "
                          />
                        </NButton>
                      </NInputGroup>
                    </template>
                    <NInput
                      v-else
                      v-model:value="formValues[item.key]"
                      :placeholder="item.placeholder"
                    />
                    <span class="setting-meta">
                      {{
                        settingsByKey.get(item.key)?.isConfigured
                          ? `已配置，更新于 ${formatDate(settingsByKey.get(item.key)?.updatedAt)}`
                          : "未配置"
                      }}
                    </span>
                  </NFormItem>
                </div>
                <div class="settings-actions">
                  <NButton type="primary" :loading="saving" @click="saveSettings">
                    <template #icon>
                      <NIcon :component="KeyOutline" />
                    </template>
                    保存配置
                  </NButton>
                </div>
              </NCard>
            </section>

            <section v-if="currentView === 'audit'" class="view-stack">
              <NCard title="审计日志">
                <NDataTable
                  :columns="auditColumns"
                  :data="auditLogs"
                  :pagination="{ pageSize: 14 }"
                  :bordered="false"
                  remote
                />
              </NCard>
            </section>
          </NSpin>
        </NLayoutContent>
      </NLayout>

      <NModal
        v-model:show="confirmState.show"
        preset="dialog"
        type="error"
        :title="confirmState.title"
        :positive-text="confirmState.confirmText"
        negative-text="取消"
        @positive-click="runConfirmed"
      >
        <template #icon>
          <NIcon :component="TrashOutline" />
        </template>
        {{ confirmState.content }}
      </NModal>
    </div>
  </NConfigProvider>
</template>
