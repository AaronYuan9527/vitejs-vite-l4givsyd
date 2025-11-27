/**
 * ============================================================================
 * 🚀 業績戰情室 - Google Sheet 權限控管版 (最終優化)
 * ============================================================================
 * 修改重點：
 * 1. 移除 API 密碼輸入 (背景自動處理)。
 * 2. 移除前端權限設定 (完全依賴 Google Sheet 的 Users 分頁)。
 * 3. 極速載入優化：優先讀取 LocalStorage，達成「秒開」體驗。
 * ============================================================================
 */

import React, { useState, useEffect, useMemo } from 'react';
import { 
  Users, DollarSign, TrendingUp, BarChart2, Briefcase, Settings, 
  CheckCircle, AlertCircle, Edit3, RefreshCw, Globe, X, ChevronRight, 
  Link as LinkIcon, FileSpreadsheet, HelpCircle, Lock, ShieldCheck, 
  Activity, Wand2, AlertTriangle, ExternalLink, Play, Filter, PieChart, 
  Lightbulb, Save, Trash2, Tag, LayoutDashboard, MapPin, Building2, 
  UserCheck, List, Trophy, Calculator, LogOut, Shield, Key, Eye, EyeOff, Plus, LogIn, Mail, Check
} from 'lucide-react';

// --- 內部常數 ---
// 這是後端 GAS 腳本中設定的簡易密碼，前端直接內建即可，不需要使用者輸入
const INTERNAL_API_KEY = "vgv2025"; 

// Data Fields Definition
const DATA_FIELDS = [
    { k: 'date', l: '進件日期', i: Activity },
    { k: 'amount', l: '金額', i: DollarSign },
    { k: 'currency', l: '幣別', i: Globe },
    { k: 'agentName', l: '業務姓名', i: Users },
    { k: 'brandName', l: '品牌名稱', i: Tag },
    { k: 'projectName', l: '專案名稱', i: FileSpreadsheet },
    { k: 'industry', l: '產業分類', i: Briefcase },
    { k: 'status', l: '客戶狀態', i: Lightbulb },
    { k: 'country', l: '國別', i: Globe }
];

// --- Helper Functions ---
const getQuarter = (date) => {
  if (!date) return '';
  const d = new Date(date);
  if (isNaN(d.getTime())) return '';
  const month = d.getMonth() + 1;
  return Math.ceil(month / 3);
};

const cleanNumber = (value) => {
    if (!value) return 0;
    if (typeof value === 'number') return value;
    return parseFloat(String(value).replace(/,/g, '').replace('$', '').replace(/\s/g, '')) || 0;
};

const formatDate = (dateStr) => {
    if (!dateStr) return '';
    if (typeof dateStr === 'string' && dateStr.length >= 10) {
        return dateStr.substring(0, 10);
    }
    return dateStr;
};

const cleanText = (str) => {
    if (!str) return '';
    let cleaned = String(str);
    cleaned = cleaned.replace(/<[^>]*>?/gm, '');
    cleaned = cleaned.replace(/\\n/g, ' ').replace(/\n/g, ' ');
    return cleaned.trim();
};

const normalizeCountry = (country, currency) => {
    const c = String(country || '').trim().toLowerCase();
    const cur = String(currency || '').trim().toUpperCase().replace(/\s/g, ''); 
    
    if (c.includes('taiwan') || c.includes('台灣') || c.includes('tw')) return '台灣';
    if (c.includes('overseas') || c.includes('海外') || c.includes('foreign')) return '海外';
    
    if (cur.includes('TWD') || cur.includes('NT') || cur.includes('臺幣') || cur.includes('台幣')) return '台灣';
    
    return '海外'; 
};

const formatCurrency = (val) => {
    if (val === undefined || val === null) return '$0';
    if (typeof val === 'string' && val.includes('🔒')) return val; 
    const num = Number(val);
    if (isNaN(num)) return '$0';
    return num.toLocaleString(undefined, { maximumFractionDigits: 0 });
};

// --- Components ---

class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }
  static getDerivedStateFromError(error) { return { hasError: true, error }; }
  componentDidCatch(error, errorInfo) { console.error("ErrorBoundary caught error", error, errorInfo); }
  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen flex items-center justify-center bg-slate-50 p-4">
           <div className="bg-white p-6 rounded-xl shadow-lg max-w-md text-center">
             <AlertCircle className="mx-auto text-red-500 mb-4" size={40}/>
             <h2 className="text-lg font-bold mb-2">應用程式發生錯誤</h2>
             <p className="text-sm text-gray-500 mb-4">
               {this.state.error && this.state.error.toString()}
             </p>
             <button onClick={() => window.location.reload()} className="bg-indigo-600 text-white px-4 py-2 rounded-lg">重新整理</button>
           </div>
        </div>
      );
    }
    return this.props.children; 
  }
}

// ... [Charts Code: StackedBarChart, DonutChart] ...
const StackedBarChart = ({ data, height = 300, type = 'region' }) => {
    if (!data || data.length === 0) return <div className="h-64 flex items-center justify-center text-slate-400">無資料可顯示圖表</div>;
    const maxValue = Math.max(...data.map(d => d.total)) || 1; 
    const chartHeight = height - 40; 
    const config = type === 'region' ? { key1: 'taiwan', key2: 'overseas', color1: 'from-pink-400 to-pink-300', color2: 'from-purple-600 to-purple-500', label1: '台灣', label2: '海外', text1: 'text-pink-300', text2: 'text-purple-300' } : { key1: 'newClient', key2: 'oldClient', color1: 'from-emerald-400 to-emerald-300', color2: 'from-blue-600 to-blue-500', label1: '新客戶', label2: '續約客戶', text1: 'text-emerald-300', text2: 'text-blue-300' };
    return (
        <div className="w-full h-full flex flex-col">
            <div className="flex-1 relative border-b border-slate-200 flex items-end justify-around px-4"><div className="absolute inset-0 flex flex-col justify-between pointer-events-none">{[1, 0.75, 0.5, 0.25, 0].map(p => (<div key={p} className="w-full border-t border-slate-100 h-0 relative last:border-transparent"><span className="absolute -top-3 -left-10 text-[10px] text-slate-400 w-8 text-right">{Math.round(maxValue * p / 10000)}萬</span></div>))}</div>
                 {data.map((item, idx) => {
                     const val1 = item[config.key1] || 0; const val2 = item[config.key2] || 0; const h1 = (val1 / maxValue) * chartHeight; const h2 = (val2 / maxValue) * chartHeight;
                     return (<div key={idx} className="relative flex flex-col items-center group z-10" style={{width: `${Math.min(100/data.length, 15)}%`}}><div className="absolute bottom-full mb-2 hidden group-hover:block bg-slate-800 text-white text-xs p-3 rounded-lg shadow-xl z-20 min-w-[120px] text-center transition-opacity"><div className="font-bold mb-1 border-b border-white/20 pb-1">{item.month}</div><div className={`flex justify-between ${config.text1}`}><span>{config.label1}:</span> <span>${(val1/10000).toFixed(1)}萬</span></div><div className={`flex justify-between ${config.text2}`}><span>{config.label2}:</span> <span>${(val2/10000).toFixed(1)}萬</span></div></div><div className="w-full flex flex-col-reverse relative rounded-lg overflow-hidden shadow-sm transition-transform hover:scale-105 duration-200"><div style={{height: `${h1}px`}} className={`w-full bg-gradient-to-t ${config.color1} relative flex items-center justify-center`}></div><div style={{height: `${h2}px`}} className={`w-full bg-gradient-to-t ${config.color2} relative flex items-center justify-center border-b border-white/10`}></div></div><div className="mt-3 text-xs text-slate-500 font-medium text-center truncate w-full">{item.month.split('年')[1]}</div></div>);
                 })}
            </div>
        </div>
    );
};
const DonutChart = ({ v1, v2, size = 160, type = 'region' }) => {
    const total = v1 + v2; if (total === 0) return <div className="text-slate-300 text-xs">無數據</div>; const p1 = (v1 / total); const radius = size / 2; const strokeWidth = 25; const normalizedRadius = radius - strokeWidth / 2; const circumference = normalizedRadius * 2 * Math.PI; const offset1 = circumference - (p1 * circumference); const offset2 = circumference - ((1 - p1) * circumference); const colors = type === 'region' ? { c1: '#ec4899', c2: '#7c3aed' } : { c1: '#34d399', c2: '#2563eb' };
    return (<div className="relative flex items-center justify-center group"><svg height={size} width={size} viewBox={`0 0 ${size} ${size}`} className="transform -rotate-90 drop-shadow-sm"><circle stroke="#f1f5f9" strokeWidth={strokeWidth} fill="transparent" r={normalizedRadius} cx={radius} cy={radius} /><circle stroke={colors.c1} strokeWidth={strokeWidth} strokeDasharray={`${circumference} ${circumference}`} style={{ strokeDashoffset: offset1 }} fill="transparent" r={normalizedRadius} cx={radius} cy={radius} className="transition-all duration-1000 ease-out hover:stroke-[30px] cursor-pointer" /><circle stroke={colors.c2} strokeWidth={strokeWidth} strokeDasharray={`${circumference} ${circumference}`} style={{ strokeDashoffset: offset2, transformOrigin: 'center', transform: `rotate(${p1 * 360}deg)` }} fill="transparent" r={normalizedRadius} cx={radius} cy={radius} className="transition-all duration-1000 ease-out hover:stroke-[30px] cursor-pointer" /></svg><div className="absolute text-center pointer-events-none"><div className="text-[10px] text-slate-400 font-medium tracking-wider uppercase mb-0.5">Total Revenue</div><div className="text-lg font-bold text-slate-700 font-mono">{(total/10000).toFixed(0)}<span className="text-xs ml-0.5">萬</span></div></div></div>);
};

// --- Market Analysis ---
const MarketAnalysisSection = ({ transactions, formatCurrency }) => {
    const [viewMode, setViewMode] = useState('region');
    const { monthlyData, summary } = useMemo(() => {
        const monthMap = {};
        const sum = { s1: { revenue: 0, label: viewMode === 'region' ? '台灣' : '新客戶', revenueNoIherb: 0, countNoIherb: 0 }, s2: { revenue: 0, label: viewMode === 'region' ? '海外' : '續約客戶', revenueNoIherb: 0, countNoIherb: 0 } };
        transactions.forEach(t => {
            if (typeof t.finalAmount !== 'number') return;
            const date = new Date(t.date);
            if (isNaN(date.getTime())) return;
            const monthKey = `${date.getFullYear()}年${date.getMonth()+1}月`;
            const amt = t.finalAmount;
            const clientName = (t.brandName || t.projectName || '').toLowerCase();
            const isIherb = clientName.includes('iherb');
            let isKey1 = false;
            if (viewMode === 'region') { const region = normalizeCountry(t.country, t.detectedCurrency); isKey1 = region === '台灣'; } else { isKey1 = t.status === '新客戶'; }
            if (!monthMap[monthKey]) { monthMap[monthKey] = { month: monthKey, total: 0, sortKey: date.getTime(), taiwain: 0, overseas: 0, newClient: 0, oldClient: 0 }; }
            monthMap[monthKey].total += amt;
            if (viewMode === 'region') { isKey1 ? monthMap[monthKey].taiwan = (monthMap[monthKey].taiwan || 0) + amt : monthMap[monthKey].overseas = (monthMap[monthKey].overseas || 0) + amt; } else { isKey1 ? monthMap[monthKey].newClient = (monthMap[monthKey].newClient || 0) + amt : monthMap[monthKey].oldClient = (monthMap[monthKey].oldClient || 0) + amt; }
            const target = isKey1 ? sum.s1 : sum.s2; target.revenue += amt; if (!isIherb) { target.revenueNoIherb += amt; target.countNoIherb += 1; }
        });
        const sortedMonths = Object.values(monthMap).sort((a, b) => a.sortKey - b.sortKey).slice(-6); 
        sum.s1.avgDeal = sum.s1.countNoIherb > 0 ? Math.round(sum.s1.revenueNoIherb / sum.s1.countNoIherb) : 0; sum.s2.avgDeal = sum.s2.countNoIherb > 0 ? Math.round(sum.s2.revenueNoIherb / sum.s2.countNoIherb) : 0;
        return { monthlyData: sortedMonths, summary: sum };
    }, [transactions, viewMode]);
    const totalRevenue = summary.s1.revenue + summary.s2.revenue; const share1 = totalRevenue > 0 ? Math.round((summary.s1.revenue / totalRevenue) * 100) : 0; const share2 = totalRevenue > 0 ? Math.round((summary.s2.revenue / totalRevenue) * 100) : 0;
    const config = viewMode === 'region' ? { icon: MapPin, bgIcon: 'bg-pink-100', textIcon: 'text-pink-600', badge1: 'bg-pink-50 text-pink-700 border-pink-100', dot1: 'bg-pink-400', badge2: 'bg-purple-50 text-purple-700 border-purple-100', dot2: 'bg-purple-600', colorText1: 'text-pink-500', colorText2: 'text-purple-600', grad1: 'from-pink-50 to-pink-100/50', border1: 'border-pink-100', title1: 'text-pink-400', grad2: 'from-purple-50 to-purple-100/50', border2: 'border-purple-100', title2: 'text-purple-400', dotClass1: 'bg-pink-500', dotClass2: 'bg-purple-600', chartType: 'region' } : { icon: UserCheck, bgIcon: 'bg-emerald-100', textIcon: 'text-emerald-600', badge1: 'bg-emerald-50 text-emerald-700 border-emerald-100', dot1: 'bg-emerald-400', badge2: 'bg-blue-50 text-blue-700 border-blue-100', dot2: 'bg-blue-600', colorText1: 'text-emerald-500', colorText2: 'text-blue-600', grad1: 'from-emerald-50 to-emerald-100/50', border1: 'border-emerald-100', title1: 'text-emerald-400', grad2: 'from-blue-50 to-blue-100/50', border2: 'border-blue-100', title2: 'text-blue-400', dotClass1: 'bg-emerald-500', dotClass2: 'bg-blue-600', chartType: 'status' };

    return (
        <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden mb-8">
            <div className="px-6 py-5 border-b border-slate-100 flex flex-col md:flex-row justify-between items-center bg-slate-50/50 gap-4">
                <h3 className="font-bold text-slate-800 flex items-center text-lg"><div className={`${config.bgIcon} p-1.5 rounded-lg mr-3 ${config.textIcon}`}><config.icon size={18}/></div>市場分析</h3>
                <div className="flex bg-slate-200 p-1 rounded-xl"><button onClick={() => setViewMode('region')} className={`px-4 py-1.5 rounded-lg text-xs font-bold transition-all ${viewMode === 'region' ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>區域分佈</button><button onClick={() => setViewMode('status')} className={`px-4 py-1.5 rounded-lg text-xs font-bold transition-all ${viewMode === 'status' ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>新舊客分析</button></div>
            </div>
            <div className="p-8 grid grid-cols-1 lg:grid-cols-3 gap-10">
                <div className="lg:col-span-2 flex flex-col">
                    <div className="flex items-center justify-between mb-6"><h4 className="text-sm font-bold text-slate-500 flex items-center"><Activity size={14} className="mr-1"/> 近六個月{viewMode === 'region' ? '區域' : '新舊客'}業績趨勢</h4><div className="flex gap-4 text-xs font-medium"><div className={`flex items-center px-2 py-1 rounded-full border ${config.badge1}`}><span className={`w-2 h-2 rounded-full ${config.dot1} mr-2`}></span>{summary.s1.label}</div><div className={`flex items-center px-2 py-1 rounded-full border ${config.badge2}`}><span className={`w-2 h-2 rounded-full ${config.dot2} mr-2`}></span>{summary.s2.label}</div></div></div>
                    <div className="flex-1 min-h-[320px] bg-slate-50/30 rounded-2xl p-4 border border-slate-100"><StackedBarChart data={monthlyData} type={config.chartType} /></div>
                </div>
                <div className="flex flex-col gap-6">
                    <div className="flex flex-col items-center justify-center bg-white rounded-2xl p-6 border border-slate-100 shadow-sm"><h4 className="text-sm font-bold text-slate-500 mb-6 w-full text-left flex items-center"><PieChart size={14} className="mr-1"/> {viewMode === 'region' ? '市場佔比' : '新舊佔比'}</h4><div className="flex items-center justify-between w-full px-2"><DonutChart v1={summary.s1.revenue} v2={summary.s2.revenue} type={config.chartType} /><div className="space-y-4 text-sm pl-4 border-l border-slate-100 ml-4"><div><div className={`${config.colorText1} font-bold text-2xl`}>{share1}<span className="text-sm ml-0.5">%</span></div><div className="text-slate-400 text-xs font-medium">{summary.s1.label}</div></div><div><div className={`${config.colorText2} font-bold text-2xl`}>{share2}<span className="text-sm ml-0.5">%</span></div><div className="text-slate-400 text-xs font-medium">{summary.s2.label}</div></div></div></div></div>
                    <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-3 group"><div className={`flex items-center ${config.colorText1.replace('text-', 'text-opacity-80')} font-bold text-sm mb-2`}><span className={`w-1.5 h-1.5 rounded-full ${config.dotClass1} mr-2 group-hover:scale-125 transition-transform`}></span>{summary.s1.label}</div><div className={`bg-gradient-to-br ${config.grad1} p-4 rounded-xl border ${config.border1}`}><div className={`text-[10px] ${config.title1} font-bold uppercase tracking-wider mb-1`}>Revenue</div><div className="font-bold text-slate-700 text-lg">{formatCurrency(summary.s1.revenue)}</div></div><div className="bg-white border border-slate-100 p-3 rounded-xl flex flex-col gap-1"><div className="text-xs text-slate-400 flex items-center gap-1"><Calculator size={12} /><span>平均成交 (除 Iherb)</span></div><div className="font-bold text-slate-700 font-mono">{formatCurrency(summary.s1.avgDeal)}</div></div><div className="bg-white border border-slate-100 p-3 rounded-xl flex justify-between items-center"><div className="text-xs text-slate-400">專案數</div><div className="font-bold text-slate-700 bg-slate-100 px-2 py-0.5 rounded">{summary.s1.projects.size}</div></div></div>
                        <div className="space-y-3 group"><div className={`flex items-center ${config.colorText2.replace('text-', 'text-opacity-80')} font-bold text-sm mb-2`}><span className={`w-1.5 h-1.5 rounded-full ${config.dotClass2} mr-2 group-hover:scale-125 transition-transform`}></span>{summary.s2.label}</div><div className={`bg-gradient-to-br ${config.grad2} p-4 rounded-xl border ${config.border2}`}><div className={`text-[10px] ${config.title2} font-bold uppercase tracking-wider mb-1`}>Revenue</div><div className="font-bold text-slate-700 text-lg">{formatCurrency(summary.s2.revenue)}</div></div><div className="bg-white border border-slate-100 p-3 rounded-xl flex flex-col gap-1"><div className="text-xs text-slate-400 flex items-center gap-1"><Calculator size={12} /><span>平均成交 (除 Iherb)</span></div><div className="font-bold text-slate-700 font-mono">{formatCurrency(summary.s2.avgDeal)}</div></div><div className="bg-white border border-slate-100 p-3 rounded-xl flex justify-between items-center"><div className="text-xs text-slate-400">專案數</div><div className="font-bold text-slate-700 bg-slate-100 px-2 py-0.5 rounded">{summary.s2.projects.size}</div></div></div>
                    </div>
                </div>
            </div>
        </div>
    );
};

const DetailModal = ({ title, icon: Icon, transactions, onClose }) => {
  if (!transactions) return null;
  const sortedTransactions = [...transactions].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  return (
    <div className="fixed inset-0 bg-slate-900/40 z-50 flex items-center justify-center p-4 backdrop-blur-sm animate-in fade-in duration-300">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-5xl max-h-[85vh] flex flex-col animate-in zoom-in-95 duration-300 border border-white/20 overflow-hidden">
        <div className="px-6 py-5 border-b border-indigo-100 flex justify-between items-center bg-indigo-50">
          <div className="flex items-center gap-4"><div className="p-3 rounded-xl bg-white shadow-sm text-indigo-600"><Icon size={24} strokeWidth={2} /></div><div><h3 className="text-xl font-bold text-slate-800 tracking-tight">{title}</h3><p className="text-sm text-indigo-600 font-medium mt-0.5 opacity-90">共 {sortedTransactions.length} 筆案件</p></div></div>
          <button onClick={onClose} className="p-2 hover:bg-white/60 rounded-full transition-all duration-200 text-slate-400 hover:text-slate-700 hover:rotate-90"><X size={24} /></button>
        </div>
        <div className="overflow-y-auto p-0 flex-1 bg-white">
          <table className="w-full text-sm text-left">
            <thead className="bg-slate-50/80 text-slate-500 font-semibold sticky top-0 shadow-sm z-10 backdrop-blur-md">
              <tr><th className="px-6 py-4 whitespace-nowrap rounded-tl-lg">進件日期</th><th className="px-6 py-4">業務</th><th className="px-6 py-4">品牌名稱</th><th className="px-6 py-4">專案名稱</th><th className="px-6 py-4">產業分類</th><th className="px-6 py-4">客戶狀態</th><th className="px-6 py-4">原始幣別</th><th className="px-6 py-4 text-right rounded-tr-lg">換算金額 (臺幣)</th></tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {sortedTransactions.length === 0 ? (<tr><td colSpan={8} className="px-6 py-16 text-center text-slate-400">此區間無資料</td></tr>) : (
                sortedTransactions.map((t, idx) => (
                  <tr key={idx} className="hover:bg-slate-50/80 transition-colors group">
                    <td className="px-6 py-4 text-slate-500 font-mono text-xs">{formatDate(t.date)}</td>
                    <td className="px-6 py-4 font-medium text-slate-700">{t.agentName}</td>
                    <td className="px-6 py-4 font-medium text-indigo-600">{t.brandName || '-'}</td>
                    <td className="px-6 py-4 text-slate-800 font-medium">{t.projectName}</td>
                    <td className="px-6 py-4 text-slate-500"><span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-slate-100 text-slate-600 border border-slate-200">{t.industry}</span></td>
                    <td className="px-6 py-4"><span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border ${t.status?.includes('新') ? 'bg-emerald-50 text-emerald-700 border-emerald-100' : 'bg-blue-50 text-blue-700 border-blue-100'}`}>{t.status || '-'}</span></td>
                    <td className="px-6 py-4 text-slate-400 text-xs font-mono">{t.isUSD ? <span className="text-amber-600 font-bold">{t.detectedCurrency} {Number(t.originalAmount).toLocaleString()}</span> : (t.detectedCurrency || '臺幣')}</td>
                    <td className="px-6 py-4 text-right font-bold text-slate-700 font-mono tracking-tight group-hover:text-indigo-600 transition-colors">{formatCurrency(t.finalAmount)}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        <div className="px-8 py-5 border-t border-slate-100 bg-slate-50/50 rounded-b-2xl flex justify-end items-center gap-4"><span className="text-sm text-slate-500 font-medium">總計金額</span><span className="text-2xl font-bold text-indigo-600 font-mono tracking-tight">{formatCurrency(transactions.reduce((sum, t) => sum + (typeof t.finalAmount === 'number' ? t.finalAmount : 0), 0))}</span></div>
      </div>
    </div>
  );
};

const RankingModal = ({ title, data, onClose, type = 'agent' }) => {
    const isAgent = type === 'agent';
    const Icon = isAgent ? Users : Briefcase;
    const theme = isAgent ? { bg: 'bg-blue-50', text: 'text-blue-600', iconBg: 'bg-white', border: 'border-blue-100', hover: 'hover:bg-blue-50/50', rankTop: 'bg-blue-100 text-blue-700', rankOther: 'bg-slate-100 text-slate-500', bar: 'bg-blue-500' } : { bg: 'bg-orange-50', text: 'text-orange-600', iconBg: 'bg-white', border: 'border-orange-100', hover: 'hover:bg-orange-50/50', rankTop: 'bg-orange-100 text-orange-700', rankOther: 'bg-slate-100 text-slate-500', bar: 'bg-orange-500' };
    return (
        <div className="fixed inset-0 bg-slate-900/40 z-50 flex items-center justify-center p-4 backdrop-blur-sm animate-in fade-in duration-300">
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[85vh] flex flex-col animate-in zoom-in-95 duration-300 border border-white/20 overflow-hidden">
                <div className={`px-6 py-5 border-b ${theme.border} flex justify-between items-center ${theme.bg}`}>
                    <div className="flex items-center gap-4"><div className={`p-3 rounded-xl ${theme.iconBg} shadow-sm ${theme.text}`}><Icon size={24} strokeWidth={2} /></div><div><h3 className="text-xl font-bold text-slate-800 tracking-tight">{title}</h3><p className={`text-sm ${theme.text} font-medium mt-0.5 opacity-90`}>共 {data.length} {isAgent ? '位業務' : '個產業類別'}</p></div></div><button onClick={onClose} className="p-2 hover:bg-white/60 rounded-full transition-all duration-200 text-slate-400 hover:text-slate-700 hover:rotate-90"><X size={24} /></button>
                </div>
                <div className="overflow-y-auto p-0 flex-1 bg-white">
                    <table className="w-full text-sm text-left">
                        <thead className="bg-slate-50/80 text-slate-500 font-semibold sticky top-0 shadow-sm z-10 backdrop-blur-md"><tr><th className="px-6 py-4 w-16 text-center">排名</th><th className="px-6 py-4">{isAgent ? '業務姓名' : '產業名稱'}</th><th className="px-6 py-4 text-right">貢獻業績</th>{!isAgent && <th className="px-6 py-4 text-right">佔比</th>}<th className="px-6 py-4 text-right">成交件數</th></tr></thead>
                        <tbody className="divide-y divide-slate-100">{data.map((item, idx) => (<tr key={item.name} className={`${theme.hover} transition-colors group`}><td className="px-6 py-4 text-center"><div className={`w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold mx-auto ${idx < 3 ? theme.rankTop : theme.rankOther}`}>{idx + 1}</div></td><td className="px-6 py-4 font-medium text-slate-700">{item.name}</td><td className="px-6 py-4 text-right font-bold text-slate-700 font-mono">{formatCurrency(item.revenue)}</td>{!isAgent && (<td className="px-6 py-4 align-middle w-32"><div className="flex items-center gap-2 justify-end"><div className="h-1.5 w-16 bg-slate-100 rounded-full overflow-hidden"><div className={`h-full ${theme.bar} rounded-full`} style={{width: `${item.share}%`}}></div></div><span className="text-xs font-medium text-slate-500 w-8 text-right">{item.share}%</span></div></td>)}<td className="px-6 py-4 text-right text-slate-500">{item.count}</td></tr>))}</tbody>
                    </table>
                </div>
            </div>
        </div>
    );
};

// --- Dashboard Main Component ---
const Dashboard = ({ transactions, loading, error, onRefresh, user }) => {
  const [yearFilter, setYearFilter] = useState('All');
  const [quarterFilter, setQuarterFilter] = useState('All');
  const [monthFilter, setMonthFilter] = useState('All');
  const [statusFilter, setStatusFilter] = useState('All'); 
  const [agentFilter, setAgentFilter] = useState('All');
  const [industryFilter, setIndustryFilter] = useState('All'); 
  const [selectedBD, setSelectedBD] = useState(null);
  const [selectedIndustry, setSelectedIndustry] = useState(null); 
  const [selectedClient, setSelectedClient] = useState(null); 
  const [selectedStatus, setSelectedStatus] = useState(null); 
  const [showAllDetails, setShowAllDetails] = useState(false);
  const [showAgentRanking, setShowAgentRanking] = useState(false);
  const [showIndustryRanking, setShowIndustryRanking] = useState(false);
  const [exchangeRate, setExchangeRate] = useState(32.5); 
  
  useEffect(() => {
    const fetchRate = async () => {
        try {
            const res = await fetch('https://api.exchangerate-api.com/v4/latest/USD');
            const data = await res.json();
            if (data?.rates?.TWD) setExchangeRate(data.rates.TWD);
        } catch (e) { console.error("Rate fetch failed"); }
    };
    fetchRate();
  }, []);

  const { availableYears, availableAgents, availableStatuses, availableIndustries } = useMemo(() => {
    const years = new Set(); const agents = new Set(); const statuses = new Set(); const industries = new Set();
    transactions.forEach(t => {
        if (t.date) years.add(t.date.slice(0, 4));
        if (t.agentName) agents.add(t.agentName);
        if (t.status) statuses.add(t.status);
        if (t.industry) industries.add(t.industry);
    });
    return { availableYears: Array.from(years).sort().reverse(), availableAgents: Array.from(agents).sort(), availableStatuses: Array.from(statuses).sort(), availableIndustries: Array.from(industries).sort() };
  }, [transactions]);

  useEffect(() => { if (yearFilter === 'All' && availableYears.length > 0) setYearFilter(availableYears[0]); }, [availableYears]);

  const clientCounts = useMemo(() => {
      const counts = {};
      transactions.forEach(t => {
          const clientName = t.brandName || t.projectName || 'Unknown';
          counts[clientName] = (counts[clientName] || 0) + 1;
      });
      return counts;
  }, [transactions]);

  const filteredData = useMemo(() => {
    return transactions.map(t => {
        let finalAmount = typeof t.amount === 'number' ? t.amount : cleanNumber(t.amount);
        const currencyCode = t.currency ? String(t.currency).toUpperCase() : '臺幣';
        let isUSD = false;
        const normalizedCurrency = currencyCode.replace(/\s/g, '');
        const isLocal = normalizedCurrency.includes('TWD') || normalizedCurrency.includes('NT') || normalizedCurrency.includes('臺幣') || normalizedCurrency.includes('台幣');
        if (!isLocal && typeof finalAmount === 'number') { finalAmount = finalAmount * exchangeRate; isUSD = true; }
        const clientName = t.brandName || t.projectName || 'Unknown';
        const count = clientCounts[clientName] || 0;
        let calculatedStatus = '新客戶';
        if (count >= 2) calculatedStatus = '續約客戶';
        let displayAgentName = t.agentName;
        if (clientName && clientName.toLowerCase().includes('iherb')) { displayAgentName = 'Iherb (獨立客戶)'; }
        return { ...t, agentName: displayAgentName, finalAmount, originalAmount: typeof t.amount === 'number' ? t.amount : cleanNumber(t.amount), detectedCurrency: t.currency || '臺幣', isUSD, status: calculatedStatus };
    }).filter(t => {
        if (!t.date) return false;
        const tYear = t.date.slice(0, 4);
        const tMonth = new Date(t.date).getMonth() + 1;
        const tQuarter = getQuarter(t.date);
        if (yearFilter !== 'All' && tYear !== yearFilter) return false;
        if (quarterFilter !== 'All' && String(tQuarter) !== quarterFilter) return false;
        if (monthFilter !== 'All' && String(tMonth) !== monthFilter) return false;
        if (statusFilter !== 'All' && t.status !== statusFilter) return false;
        if (agentFilter !== 'All' && t.agentName !== agentFilter) return false;
        if (industryFilter !== 'All' && t.industry !== industryFilter) return false;
        return true;
    });
  }, [transactions, yearFilter, quarterFilter, monthFilter, statusFilter, agentFilter, industryFilter, exchangeRate, clientCounts]);

  const stats = useMemo(() => {
    let totalRevenue = 0;
    const bdMap = {};
    const industryMap = {};
    const clientMap = {};
    filteredData.forEach(t => {
      const amount = typeof t.finalAmount === 'number' ? t.finalAmount : 0; 
      totalRevenue += amount;
      const bdName = t.agentName || 'Unknown';
      if (!bdMap[bdName]) bdMap[bdName] = { name: bdName, revenue: 0, count: 0, brands: new Set() };
      bdMap[bdName].revenue += amount;
      bdMap[bdName].count += 1;
      if (t.projectName) bdMap[bdName].brands.add(t.projectName);
      const indName = t.industry || '未分類';
      if (!industryMap[indName]) industryMap[indName] = { name: indName, revenue: 0, count: 0 };
      industryMap[indName].revenue += amount;
      industryMap[indName].count += 1;
      const clientName = t.brandName || t.projectName || 'Unknown';
      if (!clientMap[clientName]) clientMap[clientName] = { name: clientName, revenue: 0, count: 0 };
      clientMap[clientName].revenue += amount;
      clientMap[clientName].count += 1;
    });
    const bdRanking = Object.values(bdMap).sort((a, b) => b.revenue - a.revenue);
    const industryRanking = Object.values(industryMap).map(ind => ({ ...ind, share: totalRevenue > 0 ? (ind.revenue / totalRevenue * 100).toFixed(1) : 0 })).sort((a, b) => b.revenue - a.revenue);
    const clientRanking = Object.values(clientMap).sort((a, b) => b.revenue - a.revenue).slice(0, 50);
    return { totalRevenue, bdRanking, industryRanking, clientRanking, totalCount: filteredData.length };
  }, [filteredData]);

  if (error) return (<div className="p-12 flex flex-col items-center justify-center text-center h-full animate-in fade-in"><div className="bg-red-50 p-6 rounded-full mb-6 shadow-sm"><AlertCircle size={56} className="text-red-500" /></div><h3 className="text-2xl font-bold text-slate-800 mb-3">資料讀取失敗</h3><p className="text-slate-500 mb-8 max-w-lg bg-slate-50 p-4 rounded-xl border border-slate-100 text-sm font-mono break-all leading-relaxed">{error}</p><button onClick={onRefresh} className="px-6 py-3 bg-blue-600 text-white rounded-xl hover:bg-blue-700 flex items-center shadow-lg shadow-blue-200 transition-all hover:scale-105 active:scale-95"><RefreshCw size={18} className="mr-2"/>重試連線</button></div>);
  if (transactions.length === 0 && !loading) return (<div className="flex flex-col items-center justify-center h-96 text-center p-8 bg-white rounded-3xl shadow-sm border border-slate-100 mx-auto max-w-2xl mt-12"><div className="bg-indigo-50 p-6 rounded-full mb-6"><Settings size={48} className="text-indigo-500" /></div><h3 className="text-2xl font-bold text-slate-800 mb-2">尚未設定資料來源</h3><p className="text-slate-500 mb-8">請前往「系統設定」輸入您的 GAS 網址以開始使用。</p><p className="text-xs text-slate-400 bg-slate-50 px-4 py-2 rounded-lg">如果這是您第一次使用，請確認 Apps Script 已部署完成。</p></div>);

  return (
    <div className="space-y-8 relative max-w-[1600px] mx-auto pb-12">
      {selectedBD && <DetailModal title={selectedBD} icon={Users} transactions={filteredData.filter(t => (t.agentName || 'Unknown') === selectedBD)} onClose={() => setSelectedBD(null)} formatCurrency={formatCurrency} typeColor="indigo" />}
      {selectedIndustry && <DetailModal title={selectedIndustry} icon={Briefcase} transactions={filteredData.filter(t => (t.industry || '未分類') === selectedIndustry)} onClose={() => setSelectedIndustry(null)} formatCurrency={formatCurrency} typeColor="emerald" />}
      {selectedClient && <DetailModal title={selectedClient} icon={Building2} transactions={filteredData.filter(t => (t.brandName || t.projectName || 'Unknown') === selectedClient)} onClose={() => setSelectedClient(null)} formatCurrency={formatCurrency} typeColor="amber" />}
      {selectedStatus && <DetailModal title={selectedStatus} icon={CheckCircle} transactions={filteredData.filter(t => t.status === selectedStatus)} onClose={() => setSelectedStatus(null)} formatCurrency={formatCurrency} typeColor="rose" />}
      {showAllDetails && <DetailModal title="當期全體案件明細" icon={List} transactions={filteredData} onClose={() => setShowAllDetails(false)} formatCurrency={formatCurrency} typeColor="indigo" />}
      {showAgentRanking && <RankingModal title="活躍業務排行榜" data={stats.bdRanking} onClose={() => setShowAgentRanking(false)} formatCurrency={formatCurrency} type="agent" />}
      {showIndustryRanking && <RankingModal title="產業分佈列表" data={stats.industryRanking} onClose={() => setShowIndustryRanking(false)} formatCurrency={formatCurrency} type="industry" />}
      
      <div className="bg-white p-5 rounded-2xl shadow-sm border border-slate-100 space-y-4 sticky top-0 z-20 backdrop-blur-xl bg-white/90">
        <div className="flex flex-wrap items-center gap-3">
           <div className="flex items-center space-x-0.5 p-1 bg-slate-100 rounded-xl border border-slate-200"><select className="bg-transparent text-sm py-2 pl-3 pr-8 font-semibold text-slate-700 outline-none cursor-pointer hover:bg-white rounded-lg transition-colors appearance-none" value={yearFilter} onChange={e => setYearFilter(e.target.value)}>{availableYears.map(y => <option key={y} value={y}>{y} 年</option>)}<option value="All">全部年份</option></select><div className="w-px h-6 bg-slate-300 mx-1"></div><select className="bg-transparent text-sm py-2 pl-3 pr-8 font-medium text-slate-600 outline-none cursor-pointer hover:bg-white rounded-lg transition-colors appearance-none" value={quarterFilter} onChange={e => setQuarterFilter(e.target.value)}><option value="All">全季度</option>{[1,2,3,4].map(q => <option key={q} value={q}>Q{q}</option>)}</select><div className="w-px h-6 bg-slate-300 mx-1"></div><select className="bg-transparent text-sm py-2 pl-3 pr-8 font-medium text-slate-600 outline-none cursor-pointer hover:bg-white rounded-lg transition-colors appearance-none" value={monthFilter} onChange={e => setMonthFilter(e.target.value)}><option value="All">全月份</option>{Array.from({length: 12}, (_, i) => i + 1).map(m => <option key={m} value={m}>{m}月</option>)}</select></div>
           <div className="h-8 w-px bg-slate-200 mx-2 hidden md:block"></div>
           <select className="bg-white border border-slate-200 rounded-xl text-sm py-2.5 pl-3 pr-8 outline-none focus:ring-2 focus:ring-indigo-100 hover:border-indigo-300 transition-all shadow-sm" value={agentFilter} onChange={e => setAgentFilter(e.target.value)}><option value="All">👨‍💼 所有業務</option>{availableAgents.map(a => <option key={a} value={a}>{a}</option>)}</select>
           <select className="bg-white border border-slate-200 rounded-xl text-sm py-2.5 pl-3 pr-8 outline-none focus:ring-2 focus:ring-indigo-100 hover:border-indigo-300 transition-all shadow-sm" value={industryFilter} onChange={e => setIndustryFilter(e.target.value)}><option value="All">🏭 所有產業</option>{availableIndustries.map(i => <option key={i} value={i}>{i}</option>)}</select>
           <select className="bg-white border border-slate-200 rounded-xl text-sm py-2.5 pl-3 pr-8 outline-none focus:ring-2 focus:ring-indigo-100 hover:border-indigo-300 transition-all shadow-sm" value={statusFilter} onChange={e => setStatusFilter(e.target.value)}><option value="All">🏷️ 新舊客篩選 (全部)</option><option value="新客戶">✨ 新客戶</option><option value="續約客戶">🤝 續約客戶</option></select>
           <div className="ml-auto flex items-center gap-3"><div className="hidden lg:flex items-center bg-amber-50 text-amber-700 px-3 py-1.5 rounded-full text-xs font-medium border border-amber-100 shadow-sm"><Globe size={12} className="mr-1.5"/> USD 匯率: {exchangeRate}</div><button onClick={onRefresh} disabled={loading} className="p-2.5 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-full transition-all active:scale-95" title="重新整理"><RefreshCw size={18} className={loading ? 'animate-spin' : ''} /></button></div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
           <div onClick={() => setShowAllDetails(true)} className="bg-gradient-to-br from-indigo-500 to-violet-600 p-6 rounded-2xl shadow-lg shadow-indigo-200 text-white relative overflow-hidden group cursor-pointer hover:shadow-xl hover:scale-[1.02] transition-all duration-300">
              <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity"><DollarSign size={100} /></div>
              <p className="text-indigo-100 text-sm font-medium mb-2 flex items-center"><DollarSign size={14} className="mr-1"/>總業績 (TWD)</p>
              <p className="text-3xl font-bold tracking-tight">{formatCurrency(stats.totalRevenue)}</p>
              <div className="mt-4 h-1 w-full bg-white/20 rounded-full overflow-hidden"><div className="h-full bg-white/40 w-3/4"></div></div>
              <div className="absolute bottom-3 right-4 opacity-0 group-hover:opacity-100 transition-opacity text-xs text-indigo-100 flex items-center">點擊查看詳情 <ChevronRight size={12}/></div>
           </div>
           <div onClick={() => setShowAllDetails(true)} className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100 hover:shadow-md hover:border-emerald-200 hover:scale-[1.02] transition-all duration-300 relative overflow-hidden group cursor-pointer">
              <div className="absolute -right-4 -bottom-4 opacity-5 text-emerald-500 group-hover:scale-110 transition-transform"><FileSpreadsheet size={100} /></div>
              <div className="flex items-center gap-3 mb-3"><div className="p-2 bg-emerald-50 text-emerald-600 rounded-lg group-hover:bg-emerald-100 transition-colors"><FileSpreadsheet size={20}/></div><p className="text-slate-500 text-sm font-medium">成交專案數</p></div>
              <p className="text-3xl font-bold text-slate-800">{stats.totalCount}</p>
              <div className="absolute bottom-3 right-4 opacity-0 group-hover:opacity-100 transition-opacity text-xs text-emerald-600 font-medium flex items-center">點擊查看詳情 <ChevronRight size={12}/></div>
           </div>
           <div onClick={() => setShowAgentRanking(true)} className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100 hover:shadow-md hover:border-blue-200 hover:scale-[1.02] transition-all duration-300 relative overflow-hidden group cursor-pointer">
              <div className="absolute -right-4 -bottom-4 opacity-5 text-blue-500 group-hover:scale-110 transition-transform"><Users size={100} /></div>
              <div className="flex items-center gap-3 mb-3"><div className="p-2 bg-blue-50 text-blue-600 rounded-lg group-hover:bg-blue-100 transition-colors"><Users size={20}/></div><p className="text-slate-500 text-sm font-medium">活躍業務數</p></div>
              <p className="text-3xl font-bold text-slate-800">{stats.bdRanking.length}</p>
              <div className="absolute bottom-3 right-4 opacity-0 group-hover:opacity-100 transition-opacity text-xs text-blue-600 font-medium flex items-center">查看排行榜 <Trophy size={12} className="ml-1"/></div>
           </div>
           <div onClick={() => setShowIndustryRanking(true)} className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100 hover:shadow-md hover:border-orange-200 hover:scale-[1.02] transition-all duration-300 relative overflow-hidden group cursor-pointer">
              <div className="absolute -right-4 -bottom-4 opacity-5 text-orange-500 group-hover:scale-110 transition-transform"><Briefcase size={100} /></div>
              <div className="flex items-center gap-3 mb-3"><div className="p-2 bg-orange-50 text-orange-600 rounded-lg group-hover:bg-orange-100 transition-colors"><Briefcase size={20}/></div><p className="text-slate-500 text-sm font-medium">產業類別數</p></div>
              <p className="text-3xl font-bold text-slate-800">{stats.industryRanking.length}</p>
              <div className="absolute bottom-3 right-4 opacity-0 group-hover:opacity-100 transition-opacity text-xs text-orange-600 font-medium flex items-center">查看產業分佈 <ChevronRight size={12}/></div>
           </div>
      </div>

      <MarketAnalysisSection transactions={filteredData} formatCurrency={formatCurrency} />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden flex flex-col h-full">
          <div className="px-6 py-5 border-b border-slate-100 flex justify-between items-center bg-slate-50/50"><h3 className="font-bold text-slate-800 flex items-center text-lg"><div className="bg-indigo-100 p-1.5 rounded-lg mr-3 text-indigo-600"><Users size={18}/></div>業務表現</h3></div>
          <div className="overflow-x-auto max-h-[500px]"><table className="w-full text-sm"><thead className="sticky top-0 bg-white z-10 shadow-sm text-slate-500 font-semibold text-xs uppercase tracking-wider"><tr><th className="px-6 py-4 text-left bg-slate-50/80 backdrop-blur">業務</th><th className="px-6 py-4 text-right bg-slate-50/80 backdrop-blur">總業績</th><th className="px-4 py-4 bg-slate-50/80 backdrop-blur w-10"></th></tr></thead><tbody className="divide-y divide-slate-50">{stats.bdRanking.map((bd, idx) => (<tr key={bd.name} onClick={() => setSelectedBD(bd.name)} className="hover:bg-indigo-50/50 cursor-pointer group transition-all duration-200"><td className="px-6 py-4 font-medium text-slate-700 flex items-center"><div className={`w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold mr-3 ${idx < 3 ? 'bg-amber-100 text-amber-700' : 'bg-slate-100 text-slate-500'}`}>{idx + 1}</div>{bd.name}</td><td className="px-6 py-4 text-right font-bold text-indigo-600 font-mono text-base">{formatCurrency(bd.revenue)}</td><td className="px-4 py-4 text-center text-slate-300 group-hover:text-indigo-400 transition-colors"><ChevronRight size={16} /></td></tr>))}</tbody></table></div>
        </div>
        <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden flex flex-col h-full">
          <div className="px-6 py-5 border-b border-slate-100 flex justify-between items-center bg-slate-50/50"><h3 className="font-bold text-slate-800 flex items-center text-lg"><div className="bg-emerald-100 p-1.5 rounded-lg mr-3 text-emerald-600"><Briefcase size={18} /></div>產業分析</h3></div>
          <div className="overflow-x-auto max-h-[500px]"><table className="w-full text-sm"><thead className="sticky top-0 bg-white z-10 shadow-sm text-slate-500 font-semibold text-xs uppercase tracking-wider"><tr><th className="px-6 py-4 text-left bg-slate-50/80 backdrop-blur">產業</th><th className="px-6 py-4 text-right bg-slate-50/80 backdrop-blur">貢獻業績</th><th className="px-6 py-4 text-left bg-slate-50/80 backdrop-blur w-1/3">佔比</th><th className="px-4 py-4 bg-slate-50/80 backdrop-blur w-10"></th></tr></thead><tbody className="divide-y divide-slate-50">{stats.industryRanking.map(ind => (<tr key={ind.name} onClick={() => setSelectedIndustry(ind.name)} className="hover:bg-emerald-50/50 cursor-pointer group transition-all duration-200"><td className="px-6 py-4 font-medium text-slate-700">{ind.name}</td><td className="px-6 py-4 text-right font-bold text-emerald-700 font-mono">{formatCurrency(ind.revenue)}</td><td className="px-6 py-4 align-middle"><div className="flex items-center gap-3"><div className="h-2 w-full bg-slate-100 rounded-full overflow-hidden flex-1"><div className="h-full bg-emerald-500 rounded-full transition-all duration-500 ease-out" style={{width: `${ind.share}%`}}></div></div><span className="text-xs font-medium text-slate-500 w-10 text-right">{ind.share}%</span></div></td><td className="px-4 py-4 text-center text-slate-300 group-hover:text-emerald-400 transition-colors"><ChevronRight size={16} /></td></tr>))}</tbody></table></div>
        </div>
        <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden flex flex-col h-full">
          <div className="px-6 py-5 border-b border-slate-100 flex justify-between items-center bg-slate-50/50"><h3 className="font-bold text-slate-800 flex items-center text-lg"><div className="bg-amber-100 p-1.5 rounded-lg mr-3 text-amber-600"><Building2 size={18} /></div>客戶營收排行 (Top 50)</h3></div>
          <div className="overflow-x-auto max-h-[500px]"><table className="w-full text-sm"><thead className="sticky top-0 bg-white z-10 shadow-sm text-slate-500 font-semibold text-xs uppercase tracking-wider"><tr><th className="px-6 py-4 text-left bg-slate-50/80 backdrop-blur">客戶名稱</th><th className="px-6 py-4 text-right bg-slate-50/80 backdrop-blur">貢獻業績</th><th className="px-4 py-4 bg-slate-50/80 backdrop-blur w-10"></th></tr></thead><tbody className="divide-y divide-slate-50">{stats.clientRanking.map((client, idx) => (<tr key={client.name} onClick={() => setSelectedClient(client.name)} className="hover:bg-amber-50/50 cursor-pointer group transition-all duration-200"><td className="px-6 py-4 font-medium text-slate-700 flex items-center"><div className={`w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold mr-3 ${idx < 3 ? 'bg-rose-100 text-rose-700' : 'bg-slate-100 text-slate-500'}`}>{idx + 1}</div><span className="truncate max-w-[150px]" title={client.name}>{client.name}</span></td><td className="px-6 py-4 text-right font-bold text-amber-600 font-mono">{formatCurrency(client.revenue)}</td><td className="px-4 py-4 text-center text-slate-300 group-hover:text-amber-400 transition-colors"><ChevronRight size={16} /></td></tr>))}</tbody></table></div>
        </div>
      </div>
    </div>
  );
};

// --- Login Screen ---
const LoginScreen = ({ onLogin, error }) => {
  const [email, setEmail] = useState('');
  const [loggingIn, setLoggingIn] = useState(false);
  const handleLogin = async () => {
    if(!email) return;
    setLoggingIn(true);
    await onLogin(email);
    setLoggingIn(false);
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-slate-50 p-4">
      <div className="bg-white p-8 rounded-3xl shadow-xl shadow-slate-200 w-full max-w-md text-center border border-slate-100">
        <div className="w-20 h-20 bg-indigo-600 text-white rounded-3xl flex items-center justify-center mx-auto mb-6 shadow-lg shadow-indigo-200"><ShieldCheck size={40} /></div>
        <h2 className="text-3xl font-bold text-slate-800 mb-3">業績戰情室</h2>
        <p className="text-slate-500 mb-8 text-sm leading-relaxed">Google Sheet 直連版<br/><span className="text-xs text-slate-400">請輸入您的 Email 以存取系統</span></p>
        <div className="text-left mb-6">
            <label className="block text-xs font-bold text-slate-500 mb-2 uppercase tracking-wider ml-1">Email Address</label>
            <input type="email" className="w-full border border-slate-200 rounded-xl p-3.5 outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all bg-slate-50 focus:bg-white" placeholder="name@company.com" value={email} onChange={(e) => setEmail(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && handleLogin()} />
        </div>
        {error && <div className="mb-4 text-red-500 text-xs bg-red-50 p-3 rounded-lg border border-red-100">{error}</div>}
        <button onClick={handleLogin} disabled={loggingIn} className="w-full bg-indigo-600 text-white py-4 rounded-xl font-bold hover:bg-indigo-700 transition-all shadow-lg shadow-indigo-200 active:scale-95 flex items-center justify-center disabled:opacity-70">{loggingIn ? <RefreshCw className="animate-spin mr-2" size={20}/> : <LogIn size={20} className="mr-2"/>} {loggingIn ? '驗證中...' : '進入系統'}</button>
      </div>
      <p className="mt-8 text-xs text-slate-400">Protected by VGV Asia Security</p>
    </div>
  )
}

// --- Sheet Setup Component ---
const SheetSetup = ({ onSave }) => {
  const [url, setUrl] = useState('');
  
  const handleSave = () => {
      if (!url.includes('script.google.com')) {
          alert("請輸入有效的 Google Apps Script 網址");
          return;
      }
      onSave(url);
  };

  return (
      <div className="max-w-2xl mx-auto mt-10">
          <div className="bg-white p-8 rounded-3xl shadow-xl border border-slate-100">
              <h3 className="text-2xl font-bold text-slate-800 text-center mb-6">系統初始化設定</h3>
              <p className="text-slate-500 text-center mb-8 text-sm">請輸入您部署的 Google Apps Script (Web App) 網址。</p>
              <input type="text" className="w-full border border-slate-200 rounded-xl p-3 mb-4" placeholder="https://script.google.com/macros/s/..." value={url} onChange={e => setUrl(e.target.value)} />
              <button onClick={handleSave} className="w-full bg-indigo-600 text-white py-3 rounded-xl font-bold">儲存並連線</button>
          </div>
      </div>
  );
};

// --- Main App Component ---
export default function SalesApp() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [transactions, setTransactions] = useState([]);
  const [gasUrl, setGasUrl] = useState(() => localStorage.getItem('vgv_gas_url') || DEFAULT_GAS_URL);
  const [isSetup, setIsSetup] = useState(() => !!localStorage.getItem('vgv_gas_url'));

  // 1. Check LocalStorage for existing session
  useEffect(() => {
      const savedUser = localStorage.getItem('vgv_user');
      if (savedUser) {
          const parsedUser = JSON.parse(savedUser);
          setUser(parsedUser);
          fetchData(parsedUser);
      }
  }, []);

  const handleLogin = async (email) => {
      setLoading(true);
      setError('');
      try {
          const formData = new FormData();
          formData.append('action', 'login');
          formData.append('password', INTERNAL_API_KEY);
          formData.append('email', email);

          // Use POST to avoid URL length limits and cleaner URL
          const res = await fetch(gasUrl, {
              method: 'POST',
              body: formData
          });
          
          const json = await res.json();
          if (json.status === 'success') {
              setUser(json.user);
              localStorage.setItem('vgv_user', JSON.stringify(json.user));
              fetchData(json.user); // Fetch data immediately after login
          } else {
              setError(json.message || '登入失敗，請確認 Email 或權限');
          }
      } catch (e) {
          console.error(e);
          setError('連線錯誤，請確認 GAS 網址是否正確或稍後再試');
      } finally {
          setLoading(false);
      }
  };

  const fetchData = async (currentUser) => {
      setLoading(true);
      try {
          const formData = new FormData();
          formData.append('action', 'getData');
          formData.append('password', INTERNAL_API_KEY);

          const res = await fetch(gasUrl, {
              method: 'POST',
              body: formData
          });

          const json = await res.json();
          if (json.status === 'success') {
              // Filter columns based on user permissions
              const perms = (currentUser.permissions || '').toLowerCase();
              const allowedFields = perms === 'all' ? DATA_FIELDS.map(f => f.k) : perms.split(',').map(s => s.trim());
              
              const mappedData = json.data.map(row => {
                  const newRow = {};
                  // Simple mapping - in a real app, this mapping should be dynamic or fixed in GAS
                  newRow.date = row['日期'] || row['Date'] || row['進件日期'];
                  newRow.amount = cleanNumber(row['金額'] || row['Amount'] || row['總金額']);
                  newRow.currency = cleanText(row['幣別'] || row['Currency']);
                  newRow.agentName = cleanText(row['業務'] || row['Agent'] || row['業務姓名']);
                  newRow.brandName = cleanText(row['品牌'] || row['Brand'] || row['品牌名稱']);
                  newRow.projectName = cleanText(row['專案'] || row['Project'] || row['專案名稱']);
                  newRow.industry = cleanText(row['產業'] || row['Industry'] || row['產業分類']);
                  newRow.status = cleanText(row['狀態'] || row['Status'] || row['客戶狀態']);
                  newRow.country = cleanText(row['國家'] || row['Country'] || row['國別']);

                  // Permission Filtering
                  if (perms !== 'all') {
                      if (!allowedFields.includes('amount')) newRow.amount = 0;
                      // Add more field masking logic here if needed
                  }
                  return newRow;
              });

              setTransactions(mappedData);
          } else {
              setError(json.message);
          }
      } catch (e) {
          console.error(e);
          setError('資料讀取失敗');
      } finally {
          setLoading(false);
      }
  };

  const handleLogout = () => {
      setUser(null);
      setTransactions([]);
      localStorage.removeItem('vgv_user');
  };
  
  const handleSaveSetup = (url) => {
      setGasUrl(url);
      localStorage.setItem('vgv_gas_url', url);
      setIsSetup(true);
  };

  if (!isSetup) {
      return <SheetSetup onSave={handleSaveSetup} />;
  }

  if (!user) {
      return <LoginScreen onLogin={handleLogin} error={error} />;
  }

  return (
    <div className="min-h-screen bg-slate-50 font-sans text-slate-900 selection:bg-indigo-100">
      <div className="flex flex-col lg:flex-row min-h-screen max-w-[1920px] mx-auto">
        <aside className="w-full lg:w-72 bg-white lg:min-h-screen shadow-xl shadow-slate-200/50 border-r border-slate-100 z-10 flex flex-col">
          <div className="p-8 hidden lg:flex items-center gap-3">
            <div className="bg-indigo-600 text-white p-2.5 rounded-xl shadow-lg shadow-indigo-200"><LayoutDashboard size={24} /></div>
            <h1 className="text-xl font-bold text-slate-800 tracking-tight">業績戰情室</h1>
          </div>
          
          <div className="px-4 py-2 lg:hidden flex items-center justify-between bg-white border-b border-slate-100">
              <div className="flex items-center gap-2 font-bold text-slate-800"><LayoutDashboard size={20} className="text-indigo-600"/> 業績戰情室</div>
          </div>

          <div className="px-6 py-2 mb-2 hidden lg:block">
              <div className="flex items-center p-3 bg-slate-50 rounded-xl border border-slate-100">
                  <div className="w-8 h-8 rounded-full bg-indigo-100 text-indigo-600 flex items-center justify-center mr-3 text-xs font-bold overflow-hidden shrink-0">
                      {user.name ? user.name.substring(0, 2).toUpperCase() : "U"}
                  </div>
                  <div className="overflow-hidden w-full">
                      <div className="text-xs font-bold text-slate-700 truncate" title={user.email}>{user.name || user.email}</div>
                      <div className="text-[10px] text-slate-400 flex items-center mt-0.5">
                          {user.role === 'admin' ? <span className="text-emerald-600 flex items-center bg-emerald-50 px-1.5 py-0.5 rounded"><Shield size={10} className="mr-1"/> 管理員</span> : <span className="text-slate-500 bg-slate-100 px-1.5 py-0.5 rounded">檢視者</span>}
                      </div>
                  </div>
              </div>
          </div>

          <nav className="p-4 flex flex-row lg:flex-col gap-2 lg:mt-2">
            <button className={`flex items-center px-5 py-3.5 rounded-xl text-sm font-bold transition-all duration-200 bg-indigo-50 text-indigo-600 shadow-sm`}><TrendingUp size={20} className="mr-3" />總覽儀表板</button>
            <button onClick={handleLogout} className="flex items-center px-5 py-3.5 rounded-xl text-sm font-bold text-slate-400 hover:bg-red-50 hover:text-red-600 transition-all duration-200 mt-auto lg:mt-4"><LogOut size={20} className="mr-3" />登出</button>
          </nav>

          <div className="mt-auto p-6 hidden lg:block">
              <div className="bg-slate-50 rounded-xl p-4 border border-slate-100 text-xs text-slate-400 text-center">
                  Designed for VGV Asia
              </div>
          </div>
        </aside>
        <main className="flex-1 p-4 lg:p-10 overflow-y-auto bg-[#f8fafc]">
             <Dashboard transactions={transactions} loading={loading} error={error} onRefresh={() => fetchData(user)} user={user} />
        </main>
      </div>
    </div>
  );
}
