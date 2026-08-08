<script setup lang="ts">
/**
 * AccountingCard - 记账模块
 * 功能：记一笔、账户管理、分类管理、预算、报表、日历视图
 */
import { ref, computed, onMounted, onUnmounted, watch } from 'vue';
import BaseCard from '../../components/common/BaseCard.vue';
import BaseModal from '../../components/common/BaseModal.vue';
import type { Account, AccountCategory, Transaction, Budget } from '../../types';
import {
  getAccounts, createAccount, updateAccount, deleteAccount,
  getCategories, createCategory, updateCategory, deleteCategory,
  getTransactions, createTransaction, deleteTransaction,
  getBudgets, setBudget, deleteBudget,
  getMonthlySummary, getDailyTrend,
} from './api';

/* ===== 视图切换 ===== */
type ViewMode = 'overview' | 'accounts' | 'categories' | 'budgets' | 'calendar' | 'report';
const view = ref<ViewMode>('overview');

/* ===== 当前月份 ===== */
const now = new Date();
const yearMonth = ref(`${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`);
const navDate = ref(`${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`);

const y = computed(() => parseInt(yearMonth.value.split('-')[0]));
const m = computed(() => parseInt(yearMonth.value.split('-')[1]));

function prevMonth() {
  const d = new Date(y.value, m.value - 2, 1);
  yearMonth.value = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}
function nextMonth() {
  const d = new Date(y.value, m.value, 1);
  yearMonth.value = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}
function isCurrentMonth(): boolean {
  const d = new Date();
  return d.getFullYear() === y.value && d.getMonth() + 1 === m.value;
}

/* ===== 数据 ===== */
const accounts = ref<Account[]>([]);
const categories = ref<AccountCategory[]>([]);
const transactions = ref<Transaction[]>([]);
const budgets = ref<Budget[]>([]);
const summary = ref<{ income: number; expense: number; byCategory: { category_id: number | null; type: string; total: number }[] }>({ income: 0, expense: 0, byCategory: [] });
const dailyTrend = ref<{ date: string; income: number; expense: number }[]>([]);
const loading = ref(false);

const expenseCategories = computed(() => categories.value.filter(c => c.type === 'expense'));
const incomeCategories = computed(() => categories.value.filter(c => c.type === 'income'));

async function loadAll() {
  loading.value = true;
  try {
    const [a, c, t, b, s, d] = await Promise.all([
      getAccounts(),
      getCategories(),
      getTransactions(`${yearMonth.value}-01`),
      getBudgets('month', yearMonth.value.replace('-', '')),
      getMonthlySummary(yearMonth.value),
      getDailyTrend(yearMonth.value),
    ]);
    accounts.value = a;
    categories.value = c;
    transactions.value = t;
    budgets.value = b;
    summary.value = s;
    dailyTrend.value = d;
  } finally {
    loading.value = false;
  }
}

watch(yearMonth, loadAll);
function onAccountingUpdated() { loadAll(); }
onMounted(() => {
  loadAll();
  window.addEventListener('accounting-updated', onAccountingUpdated);
});
onUnmounted(() => {
  window.removeEventListener('accounting-updated', onAccountingUpdated);
});

/* ===== 记一笔弹窗 ===== */
const txModalVisible = ref(false);
const txForm = ref({
  type: 'expense' as 'income' | 'expense' | 'transfer',
  amount: 0,
  account_id: 0,
  to_account_id: 0,
  category_id: 0,
  remark: '',
  transaction_time: new Date().toISOString().slice(0, 16),
});

function openTxModal() {
  const firstAccount = accounts.value[0];
  txForm.value = {
    type: 'expense',
    amount: 0,
    account_id: firstAccount?.id || 0,
    to_account_id: 0,
    category_id: 0,
    remark: '',
    transaction_time: new Date().toISOString().slice(0, 16),
  };
  txModalVisible.value = true;
}

async function submitTx() {
  if (!txForm.value.amount || txForm.value.amount <= 0) return;
  if (!txForm.value.account_id && txForm.value.type !== 'transfer') return;
  // 转账模式校验转入账户
  if (txForm.value.type === 'transfer' && !txForm.value.to_account_id) return;
  // datetime-local 的值已是本地时间 "YYYY-MM-DDTHH:MM"，补全秒后直接传给 API（不转 UTC）
  const time = txForm.value.transaction_time.length === 16
    ? txForm.value.transaction_time + ':00'
    : txForm.value.transaction_time;
  await createTransaction({
    type: txForm.value.type,
    amount: txForm.value.amount,
    account_id: txForm.value.account_id,
    to_account_id: txForm.value.type === 'transfer' ? txForm.value.to_account_id || undefined : undefined,
    category_id: txForm.value.type !== 'transfer' ? txForm.value.category_id || undefined : undefined,
    remark: txForm.value.remark || undefined,
    transaction_time: time,
  });
  txModalVisible.value = false;
  await loadAll();
}

/* ===== 账户管理弹窗 ===== */
const acctModalVisible = ref(false);
const acctForm = ref({ name: '', type: 'cash' as Account['type'], balance: 0, icon: '', color: '' });
const editingAccountId = ref<number | null>(null);

function openAcctModal(account?: Account) {
  if (account) {
    editingAccountId.value = account.id;
    acctForm.value = { name: account.name, type: account.type, balance: account.balance, icon: account.icon || '', color: account.color || '' };
  } else {
    editingAccountId.value = null;
    acctForm.value = { name: '', type: 'cash', balance: 0, icon: '', color: '' };
  }
  acctModalVisible.value = true;
}

async function submitAcct() {
  if (!acctForm.value.name.trim()) return;
  if (editingAccountId.value) {
    await updateAccount(editingAccountId.value, acctForm.value);
  } else {
    await createAccount(acctForm.value);
  }
  acctModalVisible.value = false;
  await loadAll();
}

const ACCOUNT_TYPE_LABEL: Record<string, string> = { cash: '现金', bank: '银行卡', alipay: '支付宝', wechat: '微信', credit: '信用卡' };

/* ===== 分类管理弹窗 ===== */
const catModalVisible = ref(false);
const catForm = ref({ key: '', name: '', type: 'expense' as 'income' | 'expense', icon: '', color: '' });
const editingCatId = ref<number | null>(null);

function openCatModal(cat?: AccountCategory) {
  if (cat) {
    editingCatId.value = cat.id;
    catForm.value = { key: cat.key, name: cat.name, type: cat.type, icon: cat.icon || '', color: cat.color || '' };
  } else {
    editingCatId.value = null;
    catForm.value = { key: '', name: '', type: 'expense', icon: '', color: '' };
  }
  catModalVisible.value = true;
}

async function submitCat() {
  if (!catForm.value.name.trim() || !catForm.value.key.trim()) return;
  if (editingCatId.value) {
    await updateCategory(editingCatId.value, catForm.value);
  } else {
    await createCategory(catForm.value);
  }
  catModalVisible.value = false;
  await loadAll();
}

/* ===== 预算管理 ===== */
const budgetEditMap = ref<Record<number, number>>({});

function initBudgetEdit() {
  const map: Record<number, number> = {};
  // 总预算
  const totalBudget = budgets.value.find(b => !b.category_id);
  map[0] = totalBudget?.amount || 0;
  // 分类预算
  for (const cat of expenseCategories.value) {
    const b = budgets.value.find(b => b.category_id === cat.id);
    map[cat.id] = b?.amount || 0;
  }
  budgetEditMap.value = map;
}

watch(budgets, initBudgetEdit, { immediate: true });

async function saveBudget(categoryId: number) {
  const amount = budgetEditMap.value[categoryId] || 0;
  await setBudget({
    period: 'month',
    period_value: yearMonth.value.replace('-', ''),
    category_id: categoryId || undefined,
    amount,
  });
  await loadAll();
}

/* ===== 日历视图 ===== */
function getCalendarDays() {
  const firstDay = new Date(y.value, m.value - 1, 1).getDay();
  const daysInMonth = new Date(y.value, m.value, 0).getDate();
  const days: { date: string; day: number; expense: number; income: number }[] = [];

  // 空白占位
  for (let i = 0; i < firstDay; i++) {
    days.push({ date: '', day: 0, expense: 0, income: 0 });
  }

  for (let d = 1; d <= daysInMonth; d++) {
    const date = `${yearMonth.value}-${String(d).padStart(2, '0')}`;
    const trend = dailyTrend.value.find(t => t.date === date);
    days.push({
      date,
      day: d,
      expense: trend?.expense || 0,
      income: trend?.income || 0,
    });
  }
  return days;
}

const calendarDays = computed(getCalendarDays);

function maxExpenseOfMonth(): number {
  return Math.max(...dailyTrend.value.map(d => d.expense), 1);
}

/* ===== 报表SVG ===== */
const CHART_W = 300;
const CHART_H = 120;

function trendPath(data: { date: string; expense: number }[], key: 'expense'): string {
  const max = Math.max(...data.map(d => d[key]), 1);
  const stepX = data.length > 1 ? CHART_W / (data.length - 1) : CHART_W;
  return data.map((d, i) => {
    const x = i * stepX;
    const y = CHART_H - (d[key] / max) * (CHART_H - 10);
    return `${i === 0 ? 'M' : 'L'}${x},${y}`;
  }).join(' ');
}

function catPieData() {
  return summary.value.byCategory
    .filter(c => c.type === 'expense' && c.total > 0)
    .map(c => {
      const cat = categories.value.find(cat => cat.id === c.category_id);
      return { label: cat?.name || '未分类', value: c.total, color: cat?.color || '#94a3b8' };
    })
    .sort((a, b) => b.value - a.value);
}

const pieData = computed(catPieData);
const pieTotal = computed(() => pieData.value.reduce((s, d) => s + d.value, 0));

/* SVG饼图 */
function pieSlice(cx: number, cy: number, r: number, startAngle: number, endAngle: number): string {
  const x1 = cx + r * Math.cos(startAngle);
  const y1 = cy + r * Math.sin(startAngle);
  const x2 = cx + r * Math.cos(endAngle);
  const y2 = cy + r * Math.sin(endAngle);
  const large = endAngle - startAngle > Math.PI ? 1 : 0;
  return `M${cx},${cy} L${x1},${y1} A${r},${r} 0 ${large} 1 ${x2},${y2} Z`;
}

const PIE_R = 50;
const PIE_CX = 60;
const PIE_CY = 55;

const pieSlices = computed(() => {
  let currentAngle = -Math.PI / 2;
  return pieData.value.map(d => {
    const angle = (d.value / (pieTotal.value || 1)) * 2 * Math.PI;
    const slice = pieSlice(PIE_CX, PIE_CY, PIE_R, currentAngle, currentAngle + angle);
    currentAngle += angle;
    return { ...d, slice };
  });
});

/* ===== 格式化 ===== */
function fmtMoney(n: number): string {
  return n.toFixed(2);
}

/* ===== 删除确认 ===== */
async function confirmDeleteAccount(id: number) {
  if (!confirm('确认删除此账户？关联的流水记录将保留但账户将不可用。')) return;
  await deleteAccount(id);
  await loadAll();
}

async function confirmDeleteCategory(id: number) {
  if (!confirm('确认删除此分类？')) return;
  await deleteCategory(id);
  await loadAll();
}

function fmtDate(iso: string): string {
  return iso.slice(5, 10);
}

function fmtTime(iso: string): string {
  return iso.slice(11, 16);
}

function categoryName(id: number | null): string {
  if (!id) return '未分类';
  return categories.value.find(c => c.id === id)?.name || '未分类';
}

function categoryIcon(id: number | null): string {
  if (!id) return '📦';
  return categories.value.find(c => c.id === id)?.icon || '📦';
}

function accountName(id: number): string {
  return accounts.value.find(a => a.id === id)?.name || '未知账户';
}

function totalBalance(): number {
  return accounts.value.reduce((s, a) => s + a.balance, 0);
}
</script>

<template>
  <BaseCard icon="💰" title="记账">
    <template #actions>
      <button class="ac-add-btn" title="记一笔" @click="openTxModal">＋</button>
    </template>

    <!-- 视图切换导航 -->
    <div class="ac-nav">
      <button class="ac-nav-btn" :class="{ 'ac-nav-btn--active': view === 'overview' }" @click="view = 'overview'">总览</button>
      <button class="ac-nav-btn" :class="{ 'ac-nav-btn--active': view === 'calendar' }" @click="view = 'calendar'">日历</button>
      <button class="ac-nav-btn" :class="{ 'ac-nav-btn--active': view === 'accounts' }" @click="view = 'accounts'">账户</button>
      <button class="ac-nav-btn" :class="{ 'ac-nav-btn--active': view === 'categories' }" @click="view = 'categories'">分类</button>
      <button class="ac-nav-btn" :class="{ 'ac-nav-btn--active': view === 'budgets' }" @click="view = 'budgets'">预算</button>
      <button class="ac-nav-btn" :class="{ 'ac-nav-btn--active': view === 'report' }" @click="view = 'report'">报表</button>
    </div>

    <!-- ===== 总览 ===== -->
    <div v-if="view === 'overview'" class="ac-section">
      <!-- 月度收支汇总 -->
      <div class="ac-summary">
        <div class="ac-summary-row">
          <div class="ac-summary-item ac-summary-income">
            <span class="ac-summary-label">收入</span>
            <span class="ac-summary-value">¥{{ fmtMoney(summary.income) }}</span>
          </div>
          <div class="ac-summary-item ac-summary-expense">
            <span class="ac-summary-label">支出</span>
            <span class="ac-summary-value">¥{{ fmtMoney(summary.expense) }}</span>
          </div>
          <div class="ac-summary-item">
            <span class="ac-summary-label">净资产</span>
            <span class="ac-summary-value" :style="{ color: totalBalance() >= 0 ? '#22c55e' : '#ef4444' }">
              ¥{{ fmtMoney(totalBalance()) }}
            </span>
          </div>
        </div>
        <div class="ac-month-nav">
          <button class="ac-month-btn" @click="prevMonth">‹</button>
          <span class="ac-month-label">{{ yearMonth }}</span>
          <button class="ac-month-btn" :disabled="isCurrentMonth()" @click="nextMonth">›</button>
        </div>
      </div>

      <!-- 近期流水 -->
      <div class="ac-tx-list">
        <div v-for="tx in transactions.slice(0, 20)" :key="tx.id" class="ac-tx-item">
          <span class="ac-tx-icon">{{ categoryIcon(tx.category_id) }}</span>
          <div class="ac-tx-info">
            <span class="ac-tx-cat">{{ categoryName(tx.category_id) }}</span>
            <span class="ac-tx-remark">{{ tx.remark || accountName(tx.account_id) }}</span>
          </div>
          <span class="ac-tx-time">{{ fmtDate(tx.transaction_time) }} {{ fmtTime(tx.transaction_time) }}</span>
          <span class="ac-tx-amount" :class="`ac-tx-amount--${tx.type}`">
            {{ tx.type === 'income' ? '+' : '-' }}¥{{ fmtMoney(tx.amount) }}
          </span>
        </div>
        <div v-if="transactions.length === 0" class="ac-empty">暂无记录，点击右上角＋记一笔</div>
      </div>
    </div>

    <!-- ===== 日历视图 ===== -->
    <div v-if="view === 'calendar'" class="ac-section">
      <div class="ac-month-nav">
        <button class="ac-month-btn" @click="prevMonth">‹</button>
        <span class="ac-month-label">{{ yearMonth }}</span>
        <button class="ac-month-btn" :disabled="isCurrentMonth()" @click="nextMonth">›</button>
      </div>
      <div class="ac-calendar">
        <div class="ac-cal-header">
          <span v-for="w in ['日','一','二','三','四','五','六']" :key="w" class="ac-cal-weekday">{{ w }}</span>
        </div>
        <div class="ac-cal-body">
          <div v-for="(day, i) in calendarDays" :key="i" class="ac-cal-day" :class="{ 'ac-cal-day--empty': !day.day }">
            <template v-if="day.day">
              <span class="ac-cal-date" :class="{ 'ac-cal-today': day.date === navDate }">{{ day.day }}</span>
              <span v-if="day.expense > 0" class="ac-cal-expense" :style="{ opacity: Math.min(day.expense / maxExpenseOfMonth() + 0.3, 1) }">
                ¥{{ fmtMoney(day.expense) }}
              </span>
            </template>
          </div>
        </div>
      </div>
    </div>

    <!-- ===== 账户管理 ===== -->
    <div v-if="view === 'accounts'" class="ac-section">
      <div class="ac-list-header">
        <span class="ac-list-title">账户列表</span>
        <button class="ac-small-btn" @click="openAcctModal()">＋ 添加</button>
      </div>
      <div class="ac-account-list">
        <div v-for="acct in accounts" :key="acct.id" class="ac-account-item" @dblclick="openAcctModal(acct)">
          <span class="ac-account-icon">{{ acct.icon || '💳' }}</span>
          <div class="ac-account-info">
            <span class="ac-account-name">{{ acct.name }}</span>
            <span class="ac-account-type">{{ ACCOUNT_TYPE_LABEL[acct.type] || acct.type }}</span>
          </div>
          <span class="ac-account-balance" :style="{ color: acct.balance >= 0 ? 'var(--text-primary)' : '#ef4444' }">
            ¥{{ fmtMoney(acct.balance) }}
          </span>
          <button class="ac-del-btn" @click="confirmDeleteAccount(acct.id)">🗑</button>
        </div>
      </div>
    </div>

    <!-- ===== 分类管理 ===== -->
    <div v-if="view === 'categories'" class="ac-section">
      <div class="ac-list-header">
        <span class="ac-list-title">分类管理</span>
        <button class="ac-small-btn" @click="openCatModal()">＋ 添加</button>
      </div>
      <div class="ac-cat-section">
        <div class="ac-cat-type-label">支出</div>
        <div class="ac-cat-grid">
          <div v-for="cat in expenseCategories" :key="cat.id" class="ac-cat-item" @dblclick="openCatModal(cat)">
            <span class="ac-cat-icon">{{ cat.icon || '📦' }}</span>
            <span class="ac-cat-name">{{ cat.name }}</span>
            <button class="ac-del-btn-sm" @click="confirmDeleteCategory(cat.id)">✕</button>
          </div>
        </div>
        <div class="ac-cat-type-label">收入</div>
        <div class="ac-cat-grid">
          <div v-for="cat in incomeCategories" :key="cat.id" class="ac-cat-item" @dblclick="openCatModal(cat)">
            <span class="ac-cat-icon">{{ cat.icon || '🎁' }}</span>
            <span class="ac-cat-name">{{ cat.name }}</span>
            <button class="ac-del-btn-sm" @click="confirmDeleteCategory(cat.id)">✕</button>
          </div>
        </div>
      </div>
    </div>

    <!-- ===== 预算管理 ===== -->
    <div v-if="view === 'budgets'" class="ac-section">
      <div class="ac-month-nav">
        <button class="ac-month-btn" @click="prevMonth">‹</button>
        <span class="ac-month-label">{{ yearMonth }}</span>
        <button class="ac-month-btn" :disabled="isCurrentMonth()" @click="nextMonth">›</button>
      </div>
      <div class="ac-budget-list">
        <div class="ac-budget-item">
          <div class="ac-budget-info">
            <span class="ac-budget-cat">总预算</span>
            <span class="ac-budget-used">已支出 ¥{{ fmtMoney(summary.expense) }}</span>
          </div>
          <div class="ac-budget-bar-wrap">
            <div class="ac-budget-bar" :style="{ width: Math.min(summary.expense / (budgetEditMap[0] || 1) * 100, 100) + '%', background: summary.expense > (budgetEditMap[0] || 0) ? '#ef4444' : 'var(--accent-color)' }"></div>
          </div>
          <div class="ac-budget-edit">
            <input v-model.number="budgetEditMap[0]" type="number" class="ac-budget-input" placeholder="0" />
            <button class="ac-small-btn" @click="saveBudget(0)">保存</button>
          </div>
        </div>
        <div v-for="cat in expenseCategories" :key="cat.id" class="ac-budget-item">
          <div class="ac-budget-info">
            <span class="ac-budget-cat">{{ cat.icon }} {{ cat.name }}</span>
            <span class="ac-budget-used">
              已支出 ¥{{ fmtMoney(summary.byCategory.filter(c => c.category_id === cat.id).reduce((s, c) => s + c.total, 0)) }}
            </span>
          </div>
          <div class="ac-budget-bar-wrap">
            <div class="ac-budget-bar" :style="{ width: Math.min(summary.byCategory.filter(c => c.category_id === cat.id).reduce((s, c) => s + c.total, 0) / (budgetEditMap[cat.id] || 1) * 100, 100) + '%', background: summary.byCategory.filter(c => c.category_id === cat.id).reduce((s, c) => s + c.total, 0) > (budgetEditMap[cat.id] || 0) ? '#ef4444' : 'var(--accent-color)' }"></div>
          </div>
          <div class="ac-budget-edit">
            <input v-model.number="budgetEditMap[cat.id]" type="number" class="ac-budget-input" placeholder="0" />
            <button class="ac-small-btn" @click="saveBudget(cat.id)">保存</button>
          </div>
        </div>
      </div>
    </div>

    <!-- ===== 报表 ===== -->
    <div v-if="view === 'report'" class="ac-section">
      <div class="ac-month-nav">
        <button class="ac-month-btn" @click="prevMonth">‹</button>
        <span class="ac-month-label">{{ yearMonth }} 报表</span>
        <button class="ac-month-btn" :disabled="isCurrentMonth()" @click="nextMonth">›</button>
      </div>

      <!-- 月度收支趋势折线图 -->
      <div class="ac-chart-section">
        <div class="ac-chart-title">每日支出趋势</div>
        <svg :viewBox="`0 0 ${CHART_W} ${CHART_H}`" class="ac-chart-svg">
          <path :d="trendPath(dailyTrend, 'expense')" fill="none" stroke="#ef4444" stroke-width="2" stroke-linecap="round" />
          <circle
            v-for="(d, i) in dailyTrend.filter(dd => dd.expense > 0)"
            :key="i"
            :cx="i * (dailyTrend.length > 1 ? CHART_W / (dailyTrend.length - 1) : CHART_W)"
            :cy="CHART_H - (d.expense / Math.max(...dailyTrend.map(dd => dd.expense), 1)) * (CHART_H - 10)"
            r="3" fill="#ef4444"
          />
        </svg>
      </div>

      <!-- 分类占比饼图 -->
      <div class="ac-chart-section">
        <div class="ac-chart-title">支出分类占比</div>
        <div class="ac-pie-wrap">
          <svg :viewBox="`0 0 120 110`" class="ac-pie-svg">
            <path v-for="(s, i) in pieSlices" :key="i" :d="s.slice" :fill="s.color" stroke="#fff" stroke-width="1" />
          </svg>
          <div class="ac-pie-legend">
            <div v-for="(d, i) in pieData" :key="i" class="ac-pie-legend-item">
              <span class="ac-pie-dot" :style="{ background: d.color }"></span>
              <span class="ac-pie-label">{{ d.label }}</span>
              <span class="ac-pie-pct">{{ (d.value / (pieTotal || 1) * 100).toFixed(1) }}%</span>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- ===== 记一笔弹窗 ===== -->
    <BaseModal :visible="txModalVisible" title="记一笔" @close="txModalVisible = false">
      <div class="ac-form">
        <div class="ac-form-row">
          <div class="ac-form-seg">
            <button class="ac-seg" :class="{ 'ac-seg--active': txForm.type === 'expense' }" @click="txForm.type = 'expense'">支出</button>
            <button class="ac-seg" :class="{ 'ac-seg--active': txForm.type === 'income' }" @click="txForm.type = 'income'">收入</button>
            <button class="ac-seg" :class="{ 'ac-seg--active': txForm.type === 'transfer' }" @click="txForm.type = 'transfer'">转账</button>
          </div>
        </div>
        <div class="ac-form-row">
          <label class="ac-form-label">金额</label>
          <input v-model.number="txForm.amount" type="number" step="0.01" class="ac-form-input ac-form-amount" placeholder="0.00" />
        </div>
        <div class="ac-form-row">
          <label class="ac-form-label">
            {{ txForm.type === 'transfer' ? '转出账户' : '账户' }}
          </label>
          <select v-model.number="txForm.account_id" class="ac-form-select">
            <option :value="0" disabled>选择账户</option>
            <option v-for="a in accounts" :key="a.id" :value="a.id">{{ a.icon }} {{ a.name }}</option>
          </select>
        </div>
        <div v-if="txForm.type === 'transfer'" class="ac-form-row">
          <label class="ac-form-label">转入账户</label>
          <select v-model.number="txForm.to_account_id" class="ac-form-select">
            <option :value="0" disabled>选择账户</option>
            <option v-for="a in accounts.filter(aa => aa.id !== txForm.account_id)" :key="a.id" :value="a.id">{{ a.icon }} {{ a.name }}</option>
          </select>
        </div>
        <div v-if="txForm.type !== 'transfer'" class="ac-form-row">
          <label class="ac-form-label">分类</label>
          <div class="ac-form-cats">
            <button
              v-for="cat in (txForm.type === 'income' ? incomeCategories : expenseCategories)"
              :key="cat.id"
              class="ac-cat-chip"
              :class="{ 'ac-cat-chip--active': txForm.category_id === cat.id }"
              :style="txForm.category_id === cat.id ? { borderColor: cat.color || '#6366f1', color: cat.color || '#6366f1' } : {}"
              @click="txForm.category_id = cat.id"
            >{{ cat.icon }} {{ cat.name }}</button>
          </div>
        </div>
        <div class="ac-form-row">
          <label class="ac-form-label">备注</label>
          <input v-model="txForm.remark" class="ac-form-input" placeholder="可选" />
        </div>
        <div class="ac-form-row">
          <label class="ac-form-label">时间</label>
          <input v-model="txForm.transaction_time" type="datetime-local" class="ac-form-input" />
        </div>
      </div>
      <template #footer>
        <button class="btn btn-cancel" @click="txModalVisible = false">取消</button>
        <button class="btn btn-confirm" :disabled="!txForm.amount || txForm.amount <= 0" @click="submitTx">保存</button>
      </template>
    </BaseModal>

    <!-- ===== 账户编辑弹窗 ===== -->
    <BaseModal :visible="acctModalVisible" :title="editingAccountId ? '编辑账户' : '添加账户'" @close="acctModalVisible = false">
      <div class="ac-form">
        <div class="ac-form-row">
          <label class="ac-form-label">名称</label>
          <input v-model="acctForm.name" class="ac-form-input" placeholder="账户名称" />
        </div>
        <div class="ac-form-row">
          <label class="ac-form-label">类型</label>
          <select v-model="acctForm.type" class="ac-form-select">
            <option value="cash">现金</option>
            <option value="bank">银行卡</option>
            <option value="alipay">支付宝</option>
            <option value="wechat">微信</option>
            <option value="credit">信用卡</option>
          </select>
        </div>
        <div class="ac-form-row">
          <label class="ac-form-label">初始余额</label>
          <input v-model.number="acctForm.balance" type="number" step="0.01" class="ac-form-input" />
        </div>
        <div class="ac-form-row">
          <label class="ac-form-label">图标</label>
          <input v-model="acctForm.icon" class="ac-form-input" placeholder="💳" />
        </div>
        <div class="ac-form-row">
          <label class="ac-form-label">颜色</label>
          <input v-model="acctForm.color" class="ac-form-input" placeholder="#3b82f6" />
        </div>
      </div>
      <template #footer>
        <button class="btn btn-cancel" @click="acctModalVisible = false">取消</button>
        <button class="btn btn-confirm" :disabled="!acctForm.name.trim()" @click="submitAcct">保存</button>
      </template>
    </BaseModal>

    <!-- ===== 分类编辑弹窗 ===== -->
    <BaseModal :visible="catModalVisible" :title="editingCatId ? '编辑分类' : '添加分类'" @close="catModalVisible = false">
      <div class="ac-form">
        <div class="ac-form-row">
          <label class="ac-form-label">标识(key)</label>
          <input v-model="catForm.key" class="ac-form-input" placeholder="food" :disabled="!!editingCatId" />
        </div>
        <div class="ac-form-row">
          <label class="ac-form-label">名称</label>
          <input v-model="catForm.name" class="ac-form-input" placeholder="餐饮" />
        </div>
        <div class="ac-form-row">
          <label class="ac-form-label">类型</label>
          <select v-model="catForm.type" class="ac-form-select">
            <option value="expense">支出</option>
            <option value="income">收入</option>
          </select>
        </div>
        <div class="ac-form-row">
          <label class="ac-form-label">图标</label>
          <input v-model="catForm.icon" class="ac-form-input" placeholder="🍜" />
        </div>
        <div class="ac-form-row">
          <label class="ac-form-label">颜色</label>
          <input v-model="catForm.color" class="ac-form-input" placeholder="#ef4444" />
        </div>
      </div>
      <template #footer>
        <button class="btn btn-cancel" @click="catModalVisible = false">取消</button>
        <button class="btn btn-confirm" :disabled="!catForm.name.trim() || !catForm.key.trim()" @click="submitCat">保存</button>
      </template>
    </BaseModal>
  </BaseCard>
</template>

<style scoped>
/* ===== 导航 ===== */
.ac-nav {
  display: flex;
  gap: 2px;
  margin-bottom: 10px;
  flex-shrink: 0;
  border-bottom: 1px solid var(--border-color);
  overflow-x: auto;
}

.ac-nav-btn {
  flex-shrink: 0;
  padding: 6px 10px;
  background: transparent;
  border: none;
  border-bottom: 2px solid transparent;
  cursor: pointer;
  color: var(--text-secondary);
  font-size: 11px;
  transition: all 0.2s;
  margin-bottom: -1px;
  font-family: inherit;
}

.ac-nav-btn:hover { color: var(--text-primary); }
.ac-nav-btn--active { color: var(--accent-color); border-bottom-color: var(--accent-color); font-weight: 600; }

.ac-section { flex: 1; overflow-y: auto; min-height: 0; }

/* ===== 添加按钮 ===== */
.ac-add-btn {
  width: 26px; height: 26px;
  border: none; border-radius: var(--radius-sm);
  background: var(--accent-color); color: #fff;
  font-size: 16px; cursor: pointer;
  display: flex; align-items: center; justify-content: center;
  transition: all 0.2s;
}
.ac-add-btn:hover { background: var(--accent-hover); transform: scale(1.05); }

/* ===== 月度汇总 ===== */
.ac-summary {
  margin-bottom: 12px;
}

.ac-summary-row {
  display: flex;
  gap: 8px;
  margin-bottom: 8px;
}

.ac-summary-item {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 2px;
  padding: 10px 6px;
  border-radius: var(--radius-sm);
  background: var(--bg-hover);
}

.ac-summary-label { font-size: 10px; color: var(--text-tertiary); }
.ac-summary-value { font-size: 16px; font-weight: 700; font-variant-numeric: tabular-nums; }
.ac-summary-income .ac-summary-value { color: #22c55e; }
.ac-summary-expense .ac-summary-value { color: #ef4444; }

.ac-month-nav {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
}

.ac-month-btn {
  background: transparent; border: none;
  cursor: pointer; color: var(--text-secondary);
  font-size: 18px; padding: 2px 8px;
  border-radius: var(--radius-sm);
  transition: all 0.2s;
}
.ac-month-btn:hover { background: var(--bg-hover); color: var(--text-primary); }
.ac-month-btn:disabled { opacity: 0.3; cursor: not-allowed; }

.ac-month-label {
  font-size: 14px; font-weight: 600;
  color: var(--text-primary);
  min-width: 80px; text-align: center;
}

/* ===== 流水列表 ===== */
.ac-tx-list { display: flex; flex-direction: column; gap: 1px; }

.ac-tx-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 6px;
  border-radius: var(--radius-sm);
  transition: background 0.15s;
}
.ac-tx-item:hover { background: var(--bg-hover); }

.ac-tx-icon { font-size: 16px; flex-shrink: 0; }

.ac-tx-info {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 1px;
}

.ac-tx-cat { font-size: 13px; color: var(--text-primary); }
.ac-tx-remark { font-size: 11px; color: var(--text-tertiary); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

.ac-tx-time { font-size: 10px; color: var(--text-tertiary); flex-shrink: 0; font-variant-numeric: tabular-nums; }

.ac-tx-amount {
  font-size: 13px;
  font-weight: 600;
  flex-shrink: 0;
  font-variant-numeric: tabular-nums;
  min-width: 70px;
  text-align: right;
}
.ac-tx-amount--income { color: #22c55e; }
.ac-tx-amount--expense { color: #ef4444; }

.ac-empty { padding: 32px 0; text-align: center; color: var(--text-tertiary); font-size: 13px; }

/* ===== 日历 ===== */
.ac-calendar { margin-top: 8px; }

.ac-cal-header {
  display: grid;
  grid-template-columns: repeat(7, 1fr);
  text-align: center;
  margin-bottom: 4px;
}

.ac-cal-weekday { font-size: 10px; color: var(--text-tertiary); padding: 4px 0; }

.ac-cal-body {
  display: grid;
  grid-template-columns: repeat(7, 1fr);
  gap: 2px;
}

.ac-cal-day {
  aspect-ratio: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 1px;
  border-radius: var(--radius-sm);
  padding: 2px;
}
.ac-cal-day--empty { visibility: hidden; }

.ac-cal-date { font-size: 12px; font-weight: 500; color: var(--text-primary); }
.ac-cal-today { color: #fff; background: var(--accent-color); border-radius: 50%; width: 22px; height: 22px; display: flex; align-items: center; justify-content: center; }

.ac-cal-expense {
  font-size: 8px;
  color: #ef4444;
  font-weight: 600;
  font-variant-numeric: tabular-nums;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 100%;
  white-space: nowrap;
}

/* ===== 账户列表 ===== */
.ac-list-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 8px;
}

.ac-list-title { font-size: 12px; font-weight: 600; color: var(--text-secondary); }

.ac-small-btn {
  padding: 4px 10px;
  border: 1px solid var(--border-color);
  border-radius: var(--radius-sm);
  background: var(--bg-input);
  color: var(--text-secondary);
  cursor: pointer;
  font-size: 11px;
  font-family: inherit;
  transition: all 0.2s;
}
.ac-small-btn:hover { border-color: var(--accent-color); color: var(--accent-color); }

.ac-account-list { display: flex; flex-direction: column; gap: 2px; }

.ac-account-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 6px;
  border-radius: var(--radius-sm);
  cursor: default;
  transition: background 0.15s;
}
.ac-account-item:hover { background: var(--bg-hover); }

.ac-account-icon { font-size: 18px; flex-shrink: 0; }

.ac-account-info {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 1px;
  min-width: 0;
}

.ac-account-name { font-size: 13px; color: var(--text-primary); }
.ac-account-type { font-size: 10px; color: var(--text-tertiary); }

.ac-account-balance {
  font-size: 14px;
  font-weight: 600;
  font-variant-numeric: tabular-nums;
  flex-shrink: 0;
}

.ac-del-btn {
  background: transparent; border: none;
  cursor: pointer; padding: 4px;
  opacity: 0.3; transition: opacity 0.2s;
  font-size: 12px;
}
.ac-del-btn:hover { opacity: 1; }

/* ===== 分类 ===== */
.ac-cat-section { display: flex; flex-direction: column; gap: 8px; }

.ac-cat-type-label { font-size: 11px; font-weight: 600; color: var(--text-secondary); padding: 4px 0; }

.ac-cat-grid {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
}

.ac-cat-item {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 5px 8px;
  border: 1px solid var(--border-color);
  border-radius: var(--radius-sm);
  cursor: default;
  transition: border-color 0.2s;
}
.ac-cat-item:hover { border-color: var(--border-hover); }

.ac-cat-icon { font-size: 14px; }
.ac-cat-name { font-size: 12px; color: var(--text-primary); }

.ac-del-btn-sm {
  background: transparent; border: none;
  cursor: pointer; padding: 1px 3px;
  opacity: 0.3; font-size: 10px;
  transition: opacity 0.2s;
}
.ac-del-btn-sm:hover { opacity: 1; }

/* ===== 预算 ===== */
.ac-budget-list { display: flex; flex-direction: column; gap: 8px; }

.ac-budget-item {
  padding: 8px;
  border-radius: var(--radius-sm);
  background: var(--bg-hover);
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.ac-budget-info {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.ac-budget-cat { font-size: 12px; font-weight: 500; color: var(--text-primary); }
.ac-budget-used { font-size: 10px; color: var(--text-tertiary); }

.ac-budget-bar-wrap {
  height: 6px;
  background: var(--border-color);
  border-radius: 3px;
  overflow: hidden;
}

.ac-budget-bar {
  height: 100%;
  border-radius: 3px;
  transition: width 0.3s;
}

.ac-budget-edit {
  display: flex;
  gap: 4px;
  align-items: center;
}

.ac-budget-input {
  flex: 1;
  padding: 4px 8px;
  border: 1px solid var(--border-color);
  border-radius: 4px;
  background: var(--bg-input);
  color: var(--text-primary);
  font-size: 12px;
  outline: none;
  font-family: inherit;
  width: 80px;
}
.ac-budget-input:focus { border-color: var(--accent-color); }

/* ===== 报表图表 ===== */
.ac-chart-section {
  margin-bottom: 12px;
}

.ac-chart-title { font-size: 11px; font-weight: 600; color: var(--text-secondary); margin-bottom: 6px; }

.ac-chart-svg { width: 100%; height: auto; display: block; }

.ac-pie-wrap {
  display: flex;
  gap: 12px;
  align-items: center;
}

.ac-pie-svg { width: 120px; height: 110px; flex-shrink: 0; }

.ac-pie-legend {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.ac-pie-legend-item {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 11px;
}

.ac-pie-dot { width: 8px; height: 8px; border-radius: 50%; flex-shrink: 0; }
.ac-pie-label { color: var(--text-primary); flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.ac-pie-pct { color: var(--text-tertiary); font-variant-numeric: tabular-nums; }

/* ===== 表单 ===== */
.ac-form { display: flex; flex-direction: column; gap: 12px; }

.ac-form-row { display: flex; flex-direction: column; gap: 6px; }

.ac-form-label { font-size: 12px; color: var(--text-secondary); }

.ac-form-input {
  padding: 8px 12px;
  border: 1px solid var(--border-color);
  border-radius: var(--radius-sm);
  background: var(--bg-input);
  color: var(--text-primary);
  font-size: 14px;
  outline: none;
  font-family: inherit;
  transition: border-color 0.2s;
}
.ac-form-input:focus { border-color: var(--accent-color); }

.ac-form-amount { font-size: 20px; font-weight: 700; text-align: center; }

.ac-form-select {
  padding: 8px 12px;
  border: 1px solid var(--border-color);
  border-radius: var(--radius-sm);
  background: var(--bg-input);
  color: var(--text-primary);
  font-size: 14px;
  outline: none;
  font-family: inherit;
  cursor: pointer;
}

.ac-form-seg {
  display: flex;
  border: 1px solid var(--border-color);
  border-radius: var(--radius-sm);
  overflow: hidden;
}

.ac-seg {
  flex: 1;
  padding: 8px;
  background: transparent;
  border: none;
  cursor: pointer;
  color: var(--text-secondary);
  font-size: 13px;
  transition: all 0.2s;
  font-family: inherit;
}
.ac-seg:hover { color: var(--text-primary); }
.ac-seg--active { background: var(--accent-color); color: #fff; }

.ac-form-cats {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  max-height: 120px;
  overflow-y: auto;
}

.ac-cat-chip {
  padding: 4px 8px;
  border: 1px solid var(--border-color);
  border-radius: var(--radius-sm);
  background: transparent;
  cursor: pointer;
  font-size: 11px;
  color: var(--text-secondary);
  transition: all 0.2s;
  font-family: inherit;
}
.ac-cat-chip:hover { border-color: var(--border-hover); }
.ac-cat-chip--active { border-color: var(--accent-color); color: var(--accent-color); background: var(--accent-light); }

/* ===== 通用按钮 ===== */
.btn {
  padding: 8px 18px;
  border: none;
  border-radius: var(--radius-sm);
  cursor: pointer;
  font-size: 13px;
  font-family: inherit;
  transition: all 0.2s;
}
.btn-cancel { background: var(--bg-hover); color: var(--text-secondary); }
.btn-cancel:hover { background: var(--border-color); }
.btn-confirm { background: var(--accent-color); color: #fff; }
.btn-confirm:hover { background: var(--accent-hover); }
.btn-confirm:disabled { opacity: 0.6; cursor: not-allowed; }
</style>