<script setup lang="ts">
/**
 * MobileExpenseCard - 移动端首页支出卡片
 * 显示今日收支汇总 + ➕快捷入口
 */
import { ref, onMounted, onUnmounted } from 'vue';
import { getTransactions, createTransaction } from '../modules/accounting/api';
import type { Transaction } from '../types';
import Icon from './Icon.vue';

const todayExpense = ref(0);
const todayIncome = ref(0);
const recentTx = ref<Transaction | null>(null);

async function loadData() {
  try {
    const today = new Date().toISOString().slice(0, 10);
    const txs = await getTransactions(today);
    todayExpense.value = txs.filter(t => t.type === 'expense').reduce((s, t) => s + t.amount, 0);
    todayIncome.value = txs.filter(t => t.type === 'income').reduce((s, t) => s + t.amount, 0);
    recentTx.value = txs[0] || null;
  } catch {
    // 忽略错误
  }
}

function onAccountingUpdated() { loadData(); }
onMounted(() => {
  loadData();
  window.addEventListener('accounting-updated', onAccountingUpdated);
});
onUnmounted(() => {
  window.removeEventListener('accounting-updated', onAccountingUpdated);
});

/* 快捷记一笔 */
const showQuickAdd = ref(false);
const quickAmount = ref('');
const quickRemark = ref('');

async function quickExpense() {
  const amt = parseFloat(quickAmount.value);
  if (!amt || amt <= 0) return;
  await createTransaction({
    type: 'expense',
    amount: amt,
    account_id: 1,
    remark: quickRemark.value || undefined,
  });
  showQuickAdd.value = false;
  quickAmount.value = '';
  quickRemark.value = '';
  await loadData();
}
</script>

<template>
  <div class="m-expense-card">
    <div class="m-card-header">
      <div class="m-card-title-row">
        <Icon name="wallet" :size="16" class="m-card-icon" />
        <span class="m-card-title">今日支出</span>
      </div>
      <button class="m-add-btn" @click="showQuickAdd = !showQuickAdd">
        <Icon name="plus" :size="13" />
        记一笔
      </button>
    </div>

    <div class="m-expense-row">
      <span class="m-expense-label">支出</span>
      <span class="m-expense-amount expense">¥{{ todayExpense.toFixed(2) }}</span>
    </div>
    <div class="m-expense-row">
      <span class="m-expense-label">收入</span>
      <span class="m-expense-amount income">¥{{ todayIncome.toFixed(2) }}</span>
    </div>
    <div v-if="recentTx" class="m-recent">
      <span class="m-recent-label">最近</span>
      <span class="m-recent-text">{{ recentTx.remark || '未备注' }} -¥{{ recentTx.amount.toFixed(2) }}</span>
    </div>

    <!-- 快捷记一笔 -->
    <div v-if="showQuickAdd" class="m-quick-add">
      <input v-model="quickAmount" type="number" placeholder="金额" class="m-input" />
      <input v-model="quickRemark" type="text" placeholder="备注" class="m-input" />
      <button class="m-save-btn" @click="quickExpense">保存</button>
    </div>
  </div>
</template>

<style scoped>
.m-expense-card {
  background: var(--bg-card, #fafafa);
  border-radius: 14px;
  padding: 14px 16px;
  border: 1px solid var(--border-color, #e5e5ea);
}
.m-card-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 10px;
}
.m-card-title-row { display: flex; align-items: center; gap: 6px; }
.m-card-icon { color: #6366f1; }
.m-card-title { font-size: 14px; font-weight: 600; }
.m-add-btn {
  display: flex;
  align-items: center;
  gap: 3px;
  font-size: 12px;
  color: #6366f1;
  background: #eef2ff;
  padding: 4px 12px;
  border-radius: 999px;
  border: none;
  font-weight: 500;
  cursor: pointer;
}
.m-add-btn:active { transform: scale(0.95); }
.m-expense-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 4px 0;
  font-size: 13px;
}
.m-expense-label { color: var(--text-secondary, #6e6e73); }
.m-expense-amount { font-weight: 600; font-variant-numeric: tabular-nums; }
.m-expense-amount.expense { color: #ef4444; }
.m-expense-amount.income { color: #22c55e; }
.m-recent {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-top: 6px;
  padding-top: 8px;
  border-top: 1px solid var(--border-color, #e5e5ea);
  font-size: 12px;
}
.m-recent-label { color: var(--text-primary, #1d1d1f); font-weight: 600; }
.m-recent-text { color: var(--text-secondary, #6e6e73); }
.m-quick-add {
  display: flex;
  gap: 8px;
  margin-top: 10px;
  padding-top: 10px;
  border-top: 1px solid var(--border-color, #e5e5ea);
}
.m-input {
  flex: 1;
  padding: 8px 10px;
  border: 1px solid var(--border-color, #e5e5ea);
  border-radius: 8px;
  font-size: 13px;
  outline: none;
  background: var(--bg-surface, #ffffff);
}
.m-input:focus { border-color: #6366f1; }
.m-save-btn {
  padding: 8px 16px;
  background: #6366f1;
  color: #fff;
  border: none;
  border-radius: 8px;
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
}
.m-save-btn:active { transform: scale(0.95); }
</style>
