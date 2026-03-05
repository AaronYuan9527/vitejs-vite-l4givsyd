/**
 * ============================================================================
 * 🚀 Data-Driven Hub - 欄位精準修正與儀表板復原版 (v5.2)
 * ============================================================================
 * 1. [Data] 營收強制鎖定「委刊單金額 (未稅)」。
 * 2. [Data] 客戶排行改為統計「品牌名稱」。
 * 3. [UI] 修復儀表板下方三大排行區塊顯示問題。
 * 4. [Auth] 完整保留密碼管理功能。
 * ============================================================================
 */

import React, { useState, useEffect, useMemo, useRef } from 'react';
import { 
  Users, DollarSign, TrendingUp, BarChart2, Briefcase, Settings, 
  CheckCircle, AlertCircle, Edit3, RefreshCw, Globe, X, ChevronRight, 
  Link as LinkIcon, FileSpreadsheet, HelpCircle, Lock, ShieldCheck, 
  Activity, Wand2, AlertTriangle, ExternalLink, Play, Filter, PieChart, 
  Lightbulb, Save, Trash2, Tag, LayoutDashboard, MapPin, Building2, 
  UserCheck, List, Trophy, Calculator, LogOut, Shield, Key, Eye, EyeOff, Plus, LogIn, Mail, Check, Zap, RotateCcw
} from 'lucide-react';

// --- 核心設定 ---
const INTERNAL_API_KEY = "vgv2025";

// BU 成員定義（2026年起使用）
const BU_MEMBERS = {
    'BU1': ['Aaron', 'Vina', 'Hannah', 'Jocelyn', 'Ting'],
    'BU2': ['Ruby', 'Sharon'],
    'BU3': ['Anna', 'Irene', 'Andrea'],
} as const;

// 判斷業務是否屬於某 BU（fallback 用，優先用 GAS 的 bu 欄位）
// 取得交易的 BU：優先用 GAS 算好的 bu 欄位，沒有才從 agentName 推斷
const getTransactionBU = (t: any): string | null => {
    // Debug: 每 100 筆輸出一次 bu 值，方便診斷
    if (Math.random() < 0.01) {
        console.log('[BU Debug]', 't.bu:', t.bu, '| t.agentName:', t.agentName, '| t.year:', t.year);
    }
    
    // 1. 優先用 GAS 回傳的 bu 欄位（2026+ 資料 GAS 已算好）
    if (t.bu) {
        const buStr = String(t.bu).trim().toUpperCase();
        // 接受 "BU1", "BU2", "BU3" 或 "bu1", "bu2", "bu3"
        if (buStr === 'BU1' || buStr === 'BU2' || buStr === 'BU3') {
            return buStr;
        }
        // 排除 "既有客戶" 或空字串
        if (buStr && buStr !== '既有客戶' && buStr !== 'UNKNOWN') {
            // 可能是其他格式，先回傳看看
            if (buStr.includes('BU')) return buStr;
        }
    }
    // 2. fallback：從 agentName 推斷（2025- 資料或 GAS 未算的情況）
    return getAgentBUFallback(t.agentName);
};

const getAgentBUFallback = (agentName: string): string | null => {
    if (!agentName) return null;
    const normalized = agentName.trim().toLowerCase();
    
    // 精確比對（避免 "Iherb (獨立客戶)" 等被誤判）
    for (const [bu, members] of Object.entries(BU_MEMBERS)) {
        for (const member of members) {
            const m = member.toLowerCase();
            // 1. 完全相同
            if (normalized === m) return bu;
            // 2. agentName 開頭是成員名（例如 "Aaron 主管" 也算）
            if (normalized.startsWith(m + ' ') || normalized.startsWith(m)) {
                // 但要排除只是包含在中間的情況
                if (normalized.indexOf(m) === 0) return bu;
            }
            // 3. 特殊處理：括號內的（例如 "Ruby (BU2)"）
            if (normalized.includes(m)) {
                // 確認不是子字串誤判（例如 "Sharon" 不應匹配 "Sharo"）
                const regex = new RegExp(`\b${m}\b`, 'i');
                if (regex.test(normalized)) return bu;
            }
        }
    }
    return null;
}; 
// 您的 Google Apps Script 部署網址
const DEFAULT_GAS_URL = "https://script.google.com/macros/s/AKfycbwDNQiKur1lMXW76SYAnl_egUEwDoZukI_xmDLeAz0Ru5PLUkZIfVR1U99hKrWmy49mbQ/exec";

// =============================================
// GAS 請求工具
// GAS Web App 的 CORS 規則：
// - GET 請求：允許跨域，但 GAS 會 302 redirect 到 googleusercontent.com
//   正確設定：mode: 'cors', redirect: 'follow', 不加任何自定義 header
// - POST 請求：觸發 preflight OPTIONS，GAS 不回應 OPTIONS = CORS block
// =============================================
const gasGet = async (url: string, params: Record<string, string>, retries = 2): Promise<any> => {
    const query = new URLSearchParams(params).toString();
    const fullUrl = `${url}?${query}`;
    let lastErr: any;
    for (let i = 0; i <= retries; i++) {
        try {
            const res = await fetch(fullUrl, {
                method: 'GET',
                redirect: 'follow',
                // 不加 headers，避免觸發 preflight
            });
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            const text = await res.text();
            // 防止 GAS 回傳 HTML（登入頁或錯誤頁）
            // 只有明確的 HTML 文件才判定為錯誤（有 DOCTYPE 或 <html> 標籤）
            const trimmed = text.trim();
            if (trimmed.startsWith('<!DOCTYPE') || trimmed.startsWith('<html')) {
                throw new TypeError('GAS 回傳 HTML 文件（可能部署權限未設為「所有人」）');
            }
            return JSON.parse(text);
        } catch (e) {
            lastErr = e;
            if (i < retries) await new Promise(r => setTimeout(r, 800 * (i + 1)));
        }
    }
    throw lastErr;
};

// 相容舊名稱
const gasPost = gasGet;

// 專門用於 googleLogin（credential 是長 JWT）
const gasLoginPost = async (url: string, credential: string): Promise<any> => {
    // Google credential JWT 約 800~1200 字，加上 URL 前綴通常在 2048 字元內
    // 若超過 2048 字元，需要分割或用 POST（但 POST 會 CORS block）
    return gasGet(url, { action: 'googleLogin', credential });
};

// 資料欄位定義
const DATA_FIELDS = [
    { k: 'date', l: '進件日期', i: Activity },
    { k: 'amount', l: '金額 (未稅)', i: DollarSign },
    { k: 'currency', l: '幣別', i: Globe },
    { k: 'agentName', l: '業務姓名', i: Users },
    { k: 'brandName', l: '品牌名稱', i: Tag },
    { k: 'projectName', l: '專案名稱', i: FileSpreadsheet },
    { k: 'industry', l: '產業分類', i: Briefcase },
    { k: 'status', l: '客戶狀態', i: Lightbulb },
    { k: 'country', l: '國別', i: Globe }
];

// --- Helper Functions ---
const cleanNumber = (value) => {
    if (!value) return 0;
    if (typeof value === 'number') return value;
    // 移除所有非數字字符，只保留數字、小數點、負號
    return parseFloat(String(value).replace(/[^\d.-]/g, '')) || 0;
};

const formatDate = (dateStr) => {
    if (!dateStr) return '';
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) {
        // 嘗試解析 YYYY/MM/DD 格式
        const parts = String(dateStr).split(/[-/]/);
        if(parts.length === 3) return `${parts[0]}-${parts[1]}-${parts[2]}`;
        return String(dateStr); 
    }
    return d.toISOString().split('T')[0];
};

const cleanText = (str) => {
    if (!str) return '';
    return String(str).trim();
};

const normalizeHeaderKey = (key) => {
    return String(key || '')
        .trim()
        .replace(/\s+/g, '')
        .replace(/[()（）]/g, '')
        .toLowerCase();
};

const findKeyByNormalizedMatch = (keys, target) => {
    const t = normalizeHeaderKey(target);
    return keys.find(k => normalizeHeaderKey(k) === t);
};

// 新舊客判斷：依「客戶全名 or 品牌名稱」在全量資料中最早進件日期判斷
// 規則：同一客戶最早那一筆 = 新客戶，其餘全部 = 續約客戶
const assignNewOldByCompany = (rows) => {
    const getKey = (r) => cleanText(r.clientFullName || r['客戶全名'] || r.brandName || '');
    const parseDate = (d) => d ? String(d).replace(/\//g, '-') : '9999-12-31';

    // 1. 排序：由舊到新，找每個客戶最早出現的日期
    const sorted = [...rows].sort((a, b) => {
        const da = parseDate(a.date), db = parseDate(b.date);
        return da < db ? -1 : da > db ? 1 : 0;
    });
    const firstDate: Record<string, string> = {};
    sorted.forEach(r => {
        const k = getKey(r);
        if (k && !firstDate[k]) firstDate[k] = parseDate(r.date);
    });

    // 2. 標記：日期等於最早日期 → 新客戶候選
    rows.forEach(r => {
        const k = getKey(r);
        if (!k) { r.status = '未分類'; return; }
        r.status = parseDate(r.date) === firstDate[k] ? '新客戶' : '續約客戶';
    });

    // 3. 同一天同一客戶多筆 → 只留第一筆為新客戶
    const marked = new Set<string>();
    rows.forEach(r => {
        const k = getKey(r);
        if (!k) return;
        if (r.status === '新客戶') {
            if (marked.has(k)) r.status = '續約客戶';
            else marked.add(k);
        }
    });
    return rows;
};

const normalizeCountry = (country, currency) => {
    const c = String(country || '').trim().toLowerCase();
    const cur = String(currency || '').trim().toUpperCase().replace(/\s/g, ''); 
    if (c.includes('taiwan') || c.includes('台灣') || c.includes('tw')) return '台灣';
    if (c.includes('overseas') || c.includes('海外') || c.includes('foreign')) return '海外';
    // 若無國別欄位，用幣別判斷
    if (cur.includes('TWD') || cur.includes('NT') || cur.includes('臺幣') || cur.includes('台幣')) return '台灣';
    return '海外'; 
};

const formatCurrency = (val) => {
    if (val === undefined || val === null) return '$0';
    if (val === '***' || (typeof val === 'string' && val.includes('🔒'))) return '🔒'; 
    const num = Number(val);
    if (isNaN(num)) return '$0';
    return num.toLocaleString(undefined, { maximumFractionDigits: 0 });
};

// --- UI Components (Defined at Top Level) ---

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
           <div className="bg-white p-6 rounded-xl shadow-lg max-w-md text-center border border-red-100">
             <AlertCircle className="mx-auto text-red-500 mb-4" size={40}/>
             <h2 className="text-lg font-bold mb-2 text-slate-800">應用程式發生錯誤</h2>
             <p className="text-sm text-gray-500 mb-4 font-mono bg-slate-50 p-2 rounded text-left overflow-auto max-h-40">
               {this.state.error && this.state.error.toString()}
             </p>
             <button onClick={() => window.location.reload()} className="bg-indigo-600 text-white px-6 py-2 rounded-lg hover:bg-indigo-700 transition-colors">重新整理</button>
           </div>
        </div>
      );
    }
    return this.props.children; 
  }
}

const StackedBarChart = ({ data, height = 300, type = 'region' }) => {
    if (!data || data.length === 0) return <div className="h-64 flex items-center justify-center text-slate-400 bg-slate-50 rounded-xl border border-dashed border-slate-200">尚無資料</div>;
    const maxValue = Math.max(...data.map(d => d.total)) || 1; 
    const chartHeight = height - 40; 
    
    const config = type === 'region' ? {
        key1: 'taiwan', key2: 'overseas',
        color1: 'from-pink-400 to-pink-300', color2: 'from-purple-600 to-purple-500',
        label1: '台灣', label2: '海外', text1: 'text-pink-300', text2: 'text-purple-300'
    } : {
        key1: 'newClient', key2: 'oldClient',
        color1: 'from-emerald-400 to-emerald-300', color2: 'from-blue-600 to-blue-500',
        label1: '新客戶', label2: '續約客戶', text1: 'text-emerald-300', text2: 'text-blue-300'
    };

    return (
        <div className="w-full h-full flex flex-col">
            <div className="flex-1 relative border-b border-slate-200 flex items-end justify-around px-4">
                 <div className="absolute inset-0 flex flex-col justify-between pointer-events-none">
                    {[1, 0.75, 0.5, 0.25, 0].map(p => (
                        <div key={p} className="w-full border-t border-slate-100 h-0 relative last:border-transparent">
                            <span className="absolute -top-3 -left-10 text-[10px] text-slate-400 w-8 text-right">
                                {formatCurrency(Math.round(maxValue * p))}
                            </span>
                        </div>
                    ))}
                 </div>
                 {data.map((item, idx) => {
                     const val1 = item[config.key1] || 0;
                     const val2 = item[config.key2] || 0;
                     const h1 = (val1 / maxValue) * chartHeight;
                     const h2 = (val2 / maxValue) * chartHeight;
                     
                     return (
                         <div key={idx} className="relative flex flex-col items-center group z-10" style={{width: `${Math.min(100/data.length, 15)}%`}}>
                             <div className="absolute bottom-full mb-2 hidden group-hover:block bg-slate-800 text-white text-xs p-3 rounded-lg shadow-xl z-20 min-w-[120px] text-center transition-opacity pointer-events-none">
                                 <div className="font-bold mb-1 border-b border-white/20 pb-1">{item.month}</div>
                                 <div className={`flex justify-between ${config.text1}`}><span>{config.label1}:</span> <span>{formatCurrency(val1)}</span></div>
                                 <div className={`flex justify-between ${config.text2}`}><span>{config.label2}:</span> <span>{formatCurrency(val2)}</span></div>
                             </div>
                             <div className="w-full flex flex-col-reverse relative rounded-lg overflow-hidden shadow-sm transition-transform hover:scale-105 duration-200 cursor-pointer">
                                 <div style={{height: `${h1}px`}} className={`w-full bg-gradient-to-t ${config.color1} relative flex items-center justify-center`}></div>
                                 <div style={{height: `${h2}px`}} className={`w-full bg-gradient-to-t ${config.color2} relative flex items-center justify-center border-b border-white/10`}></div>
                             </div>
                             <div className="mt-3 text-xs text-slate-500 font-medium text-center truncate w-full">{item.month.split('年')[1]}</div>
                         </div>
                     );
                 })}
            </div>
        </div>
    );
};

const DonutChart = ({ v1, v2, size = 160, type = 'region' }) => {
    const total = v1 + v2;
    if (total === 0) return <div className="flex items-center justify-center h-full text-slate-300 text-xs">無數據</div>;
    
    const p1 = (v1 / total);
    const radius = size / 2;
    const strokeWidth = 25;
    const normalizedRadius = radius - strokeWidth / 2;
    const circumference = normalizedRadius * 2 * Math.PI;
    const offset1 = circumference - (p1 * circumference);
    const offset2 = circumference - ((1 - p1) * circumference);
    
    const colors = type === 'region' ? { c1: '#ec4899', c2: '#7c3aed' } : { c1: '#34d399', c2: '#2563eb' };

    return (
        <div className="relative flex items-center justify-center group">
            <svg height={size} width={size} viewBox={`0 0 ${size} ${size}`} className="transform -rotate-90 drop-shadow-sm">
                <circle stroke="#f1f5f9" strokeWidth={strokeWidth} fill="transparent" r={normalizedRadius} cx={radius} cy={radius} />
                <circle stroke={colors.c1} strokeWidth={strokeWidth} strokeDasharray={`${circumference} ${circumference}`} style={{ strokeDashoffset: offset1 }} fill="transparent" r={normalizedRadius} cx={radius} cy={radius} className="transition-all duration-1000 ease-out hover:stroke-[30px] cursor-pointer" />
                <circle stroke={colors.c2} strokeWidth={strokeWidth} strokeDasharray={`${circumference} ${circumference}`} style={{ strokeDashoffset: offset2, transformOrigin: 'center', transform: `rotate(${p1 * 360}deg)` }} fill="transparent" r={normalizedRadius} cx={radius} cy={radius} className="transition-all duration-1000 ease-out hover:stroke-[30px] cursor-pointer" />
            </svg>
            <div className="absolute text-center pointer-events-none">
                <div className="text-[10px] text-slate-400 font-medium tracking-wider uppercase mb-0.5">Total Revenue</div>
                <div className="text-lg font-bold text-slate-700 font-mono">{formatCurrency(total)}</div>
            </div>
        </div>
    );
};

const MarketAnalysisSection = ({ transactions }) => {
    const [viewMode, setViewMode] = useState('region');

    const { monthlyData, summary } = useMemo(() => {
        const monthMap = {};
        const sum = { 
            s1: { revenue: 0, brands: new Set(), projects: new Set(), label: viewMode === 'region' ? '台灣' : '新客戶', revenueNoIherb: 0, countNoIherb: 0 }, 
            s2: { revenue: 0, brands: new Set(), projects: new Set(), label: viewMode === 'region' ? '海外' : '續約客戶', revenueNoIherb: 0, countNoIherb: 0 } 
        };

        transactions.forEach(t => {
            if (typeof t.finalAmount !== 'number') return;

            const date = new Date(t.date);
            if (isNaN(date.getTime())) return;
            const monthKey = `${date.getFullYear()}年${date.getMonth()+1}月`;
            const amt = t.finalAmount;
            const isIherb = (t.brandName || '').toLowerCase().includes('iherb') || (t.projectName || '').toLowerCase().includes('iherb');
            
            let isKey1 = false;
            if (viewMode === 'region') {
                // 優先用 fetchData 預算好的 region，fallback 到 normalizeCountry
                const region = t.region || normalizeCountry(t.country, t.currency);
                isKey1 = region === '台灣';
            } else {
                isKey1 = t.status === '新客戶';
            }

            if (!monthMap[monthKey]) {
                monthMap[monthKey] = { 
                    month: monthKey, 
                    total: 0, 
                    sortKey: date.getTime(),
                    taiwan: 0, overseas: 0,
                    newClient: 0, oldClient: 0
                };
            }

            monthMap[monthKey].total += amt;
            if (viewMode === 'region') {
                if (isKey1) monthMap[monthKey].taiwan = (monthMap[monthKey].taiwan || 0) + amt;
                else monthMap[monthKey].overseas = (monthMap[monthKey].overseas || 0) + amt;
            } else {
                if (isKey1) monthMap[monthKey].newClient = (monthMap[monthKey].newClient || 0) + amt;
                else monthMap[monthKey].oldClient = (monthMap[monthKey].oldClient || 0) + amt;
            }

            const target = isKey1 ? sum.s1 : sum.s2;
            target.revenue += amt;
            if (!isIherb) {
                target.revenueNoIherb += amt;
                target.countNoIherb += 1;
            }
        });

        const sortedMonths = Object.values(monthMap).sort((a, b) => a.sortKey - b.sortKey).slice(-6); 
        sum.s1.avgDeal = sum.s1.countNoIherb > 0 ? Math.round(sum.s1.revenueNoIherb / sum.s1.countNoIherb) : 0;
        sum.s2.avgDeal = sum.s2.countNoIherb > 0 ? Math.round(sum.s2.revenueNoIherb / sum.s2.countNoIherb) : 0;

        return { monthlyData: sortedMonths, summary: sum };
    }, [transactions, viewMode]);

    const share1 = (summary.s1.revenue + summary.s2.revenue) > 0 ? Math.round((summary.s1.revenue / (summary.s1.revenue + summary.s2.revenue)) * 100) : 0;
    const share2 = (summary.s1.revenue + summary.s2.revenue) > 0 ? Math.round((summary.s2.revenue / (summary.s1.revenue + summary.s2.revenue)) * 100) : 0;

    const config = viewMode === 'region' ? {
        icon: MapPin, bgIcon: 'bg-pink-100', textIcon: 'text-pink-600',
        badge1: 'bg-pink-50 text-pink-700 border-pink-100', dot1: 'bg-pink-400',
        badge2: 'bg-purple-50 text-purple-700 border-purple-100', dot2: 'bg-purple-600',
        colorText1: 'text-pink-500', colorText2: 'text-purple-600',
        grad1: 'from-pink-50 to-pink-100/50', border1: 'border-pink-100', title1: 'text-pink-400',
        grad2: 'from-purple-50 to-purple-100/50', border2: 'border-purple-100', title2: 'text-purple-400',
        chartType: 'region'
    } : {
        icon: UserCheck, bgIcon: 'bg-emerald-100', textIcon: 'text-emerald-600',
        badge1: 'bg-emerald-50 text-emerald-700 border-emerald-100', dot1: 'bg-emerald-400',
        badge2: 'bg-blue-50 text-blue-700 border-blue-100', dot2: 'bg-blue-600',
        colorText1: 'text-emerald-500', colorText2: 'text-blue-600',
        grad1: 'from-emerald-50 to-emerald-100/50', border1: 'border-emerald-100', title1: 'text-emerald-400',
        grad2: 'from-blue-50 to-blue-100/50', border2: 'border-blue-100', title2: 'text-blue-400',
        chartType: 'status'
    };

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

// 4. Detail & Ranking Modals
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
            <thead className="bg-slate-800 text-slate-500 font-semibold sticky top-0 shadow-sm z-10 backdrop-blur-md">
              <tr>
                  {DATA_FIELDS.map(f => <th key={f.k} className="px-6 py-4 whitespace-nowrap">{f.l}</th>)}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {sortedTransactions.map((t, idx) => (
                  <tr key={idx} className="hover:bg-slate-50/80 transition-colors group">
                    <td className="px-6 py-4 text-slate-500 font-mono text-xs">{formatDate(t.date)}</td>
                    <td className="px-6 py-4 font-bold text-slate-700 font-mono">
                      {t.isUSD ? (
                          <div className="flex flex-col items-end">
                            <span className="text-indigo-600">{formatCurrency(t.finalAmount)}</span>
                            <span className="text-[10px] text-slate-400 font-normal whitespace-nowrap">
                                (USD {Number(t.originalAmount).toLocaleString()})
                            </span>
                          </div>
                      ) : (
                          formatCurrency(t.finalAmount)
                      )}
                    </td>
                    <td className="px-6 py-4 text-slate-400 text-xs">{t.currency}</td>
                    <td className="px-6 py-4 font-medium text-slate-700">{t.agentName}</td>
                    <td className="px-6 py-4 font-medium text-indigo-600">{t.brandName}</td>
                    <td className="px-6 py-4 text-slate-800 font-medium">{t.projectName}</td>
                    <td className="px-6 py-4 text-slate-500">{t.industry}</td>
                    <td className="px-6 py-4 text-slate-500">{t.status}</td>
                    <td className="px-6 py-4 text-slate-500">{t.country}</td>
                  </tr>
              ))}
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
    const Icon = isAgent ? Users : (type === 'industry' ? Briefcase : Building2);
    const theme = isAgent ? { bg: 'bg-blue-50', text: 'text-blue-600', iconBg: 'bg-white', border: 'border-blue-100', hover: 'hover:bg-blue-50/50', rankTop: 'bg-blue-100 text-blue-700', rankOther: 'bg-slate-100 text-slate-500', bar: 'bg-blue-500' } : { bg: 'bg-orange-50', text: 'text-orange-600', iconBg: 'bg-white', border: 'border-orange-100', hover: 'hover:bg-orange-50/50', rankTop: 'bg-orange-100 text-orange-700', rankOther: 'bg-slate-100 text-slate-500', bar: 'bg-orange-500' };
    
    return (
        <div className="fixed inset-0 bg-slate-900/40 z-50 flex items-center justify-center p-4 backdrop-blur-sm animate-in fade-in duration-300">
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[85vh] flex flex-col animate-in zoom-in-95 duration-300 border border-white/20 overflow-hidden">
                <div className={`px-6 py-5 border-b border-slate-100 flex justify-between items-center ${theme.bg}`}>
                    <div className="flex items-center gap-4">
                        <div className={`p-3 rounded-xl ${theme.iconBg} shadow-sm ${theme.text}`}><Icon size={24} strokeWidth={2} /></div>
                        <div><h3 className="text-xl font-bold text-slate-800 tracking-tight">{title}</h3><p className={`text-sm ${theme.text} font-medium mt-0.5 opacity-90`}>Top {data.length}</p></div>
                    </div>
                    <button onClick={onClose} className="p-2 hover:bg-white/60 rounded-full transition-all duration-200 text-slate-400 hover:text-slate-700 hover:rotate-90"><X size={24} /></button>
                </div>
                <div className="overflow-y-auto p-0 flex-1 bg-white">
                    <table className="w-full text-sm text-left">
                        <thead className="bg-slate-800 text-slate-500 font-semibold sticky top-0 shadow-sm z-10 backdrop-blur-md"><tr><th className="px-6 py-4 w-16 text-center">排名</th><th className="px-6 py-4">{isAgent ? '業務' : (type === 'industry' ? '產業' : '品牌')}</th><th className="px-6 py-4 text-right">業績</th><th className="px-6 py-4 text-right">件數</th></tr></thead>
                        <tbody className="divide-y divide-slate-100">{data.map((item, idx) => (<tr key={item.name} className="hover:bg-slate-50/50 transition-colors group"><td className="px-6 py-4 text-center font-bold text-slate-400">{idx + 1}</td><td className="px-6 py-4 font-medium text-slate-700">{item.name}</td><td className="px-6 py-4 text-right font-bold text-slate-700 font-mono">{formatCurrency(item.revenue)}</td><td className="px-6 py-4 text-right text-slate-500">{item.count}</td></tr>))}</tbody>
                    </table>
                </div>
            </div>
        </div>
    );
};

// 5. Admin Panel
const AdminPanel = ({ users, onSave, onRefreshUsers, loading }) => {
    const [editedUsers, setEditedUsers] = useState([]);
    const [newUserEmail, setNewUserEmail] = useState('');
    const [isSaving, setIsSaving] = useState(false);
    const bottomRef = useRef(null); 

    useEffect(() => {
        if (users) setEditedUsers(JSON.parse(JSON.stringify(users)));
    }, [users]);

    const handlePermissionChange = (email, field, checked) => {
        setEditedUsers(prev => prev.map(u => {
            if (u.email === email) {
                const perms = u.permissions === 'all' ? DATA_FIELDS.map(f=>f.k) : u.permissions.split(',').map(s=>s.trim());
                let newPerms;
                if (checked) {
                    if (!perms.includes(field)) newPerms = [...perms, field];
                    else newPerms = perms;
                }
                else newPerms = perms.filter(p => p !== field);
                return { ...u, permissions: newPerms.join(',') };
            }
            return u;
        }));
    };

    const handleRoleChange = (email, role) => {
        setEditedUsers(prev => prev.map(u => u.email === email ? { ...u, role } : u));
    };
    
    const handleAddUser = () => {
        if (!newUserEmail || !newUserEmail.includes('@')) return alert('Email 無效');
        const exists = editedUsers.find(u => u.email === newUserEmail.toLowerCase());
        if(exists) return alert('使用者已存在');

        setEditedUsers(prev => [...prev, { 
            email: newUserEmail.toLowerCase(), 
            name: newUserEmail.split('@')[0], 
            role: 'viewer', 
            permissions: 'date,amount',
            password: 'user'
        }]);
        setNewUserEmail('');
        setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: 'smooth' }), 100);
    };

    const saveChanges = async () => {
        if (!confirm('確定要儲存所有變更嗎？')) return;
        setIsSaving(true);
        
        try {
            for (const user of editedUsers) {
                const res = await onSave(user);
                if (res.status !== 'success') throw new Error(res.message || 'Unknown Error');
            }
            alert('儲存完成');
            onRefreshUsers();
        } catch(e) {
            alert('儲存失敗：' + e.message);
        } finally {
            setIsSaving(false);
        }
    };
    
    const handleResetPassword = async (email) => {
        if(!confirm(`確定要重置 ${email} 的密碼為 "user" 嗎？`)) return;
        const res = await onSave({ email }, true);
        if(res.status === 'success') alert('密碼已重置');
        else alert('重置失敗: ' + res.message);
    };

    return (
        <div className="max-w-6xl mx-auto mt-8 p-6 bg-white rounded-2xl shadow-sm border border-slate-100">
            <div className="flex justify-between items-center mb-6">
                <h2 className="text-xl font-bold text-slate-800 flex items-center"><Settings className="mr-2"/> 權限管理後台</h2>
                <button onClick={saveChanges} disabled={isSaving} className="bg-indigo-600 text-white px-4 py-2 rounded-lg font-bold flex items-center hover:bg-indigo-700 disabled:opacity-50">{isSaving ? <RefreshCw className="animate-spin mr-2"/> : <Save className="mr-2"/>} 確認並儲存</button>
            </div>
            
            <div className="flex gap-2 mb-6">
                <input type="email" className="border p-2 rounded-lg flex-1" placeholder="輸入新使用者 Email" value={newUserEmail} onChange={e => setNewUserEmail(e.target.value)}/>
                <button onClick={handleAddUser} className="bg-emerald-500 text-white px-4 py-2 rounded-lg hover:bg-emerald-600"><Plus/></button>
            </div>

            <div className="space-y-4">
                {editedUsers.map((user, idx) => (
                    <div key={idx} className="border p-4 rounded-xl bg-slate-50">
                        <div className="flex justify-between items-center mb-3">
                            <div className="font-bold text-slate-700 flex items-center"><Mail size={16} className="mr-2"/> {user.email}</div>
                            <div className="flex gap-2">
                                /* 密碼重置功能已停用（改用 Google 登入） */
                                <select value={user.role} onChange={(e) => handleRoleChange(user.email, e.target.value)} className="border rounded p-1 text-sm">
                                    <option value="viewer">檢視者</option>
                                    <option value="admin">管理員</option>
                                </select>
                            </div>
                        </div>
                        <div className="flex flex-wrap gap-2">
                            {DATA_FIELDS.map(f => {
                                const isChecked = user.permissions === 'all' || (user.permissions && user.permissions.includes(f.k));
                                return (
                                    <label key={f.k} className={`flex items-center px-3 py-1.5 rounded-lg border text-xs cursor-pointer transition-colors ${isChecked ? 'bg-indigo-100 border-indigo-200 text-indigo-700' : 'bg-white border-slate-200 text-slate-400'}`}>
                                        <input type="checkbox" className="hidden" checked={isChecked} onChange={(e) => handlePermissionChange(user.email, f.k, e.target.checked)}/>
                                        {isChecked ? <Eye size={12} className="mr-1.5"/> : <EyeOff size={12} className="mr-1.5"/>} {f.l}
                                    </label>
                                );
                            })}
                        </div>
                    </div>
                ))}
                <div ref={bottomRef}></div>
            </div>
        </div>
    );
};

// 5.5 AI Chat Panel (簡化版)
const ChatPanel = ({ onClose, user }) => {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  
  const sendMessage = async () => {
    if (!input.trim() || loading) return;
    
    const userMsg = input.trim();
    setInput('');
    setMessages(prev => [...prev, { role: 'user', content: userMsg }]);
    setLoading(true);
    
    try {
      const t = localStorage.getItem('vgv_token') || '';
      const res = await fetch(
        `https://script.google.com/macros/s/AKfycbwDNQiKur1lMXW76SYAnl_egUEwDoZukI_xmDLeAz0Ru5PLUkZIfVR1U99hKrWmy49mbQ/exec?action=callAI&token=${encodeURIComponent(t)}&message=${encodeURIComponent(userMsg)}`
      );
      const data = await res.json();
      
      if (data.status === 'success') {
        setMessages(prev => [...prev, { role: 'assistant', content: data.response }]);
      } else {
        setMessages(prev => [...prev, { role: 'assistant', content: '錯誤：' + (data.message || '未知錯誤') }]);
      }
    } catch (e) {
      setMessages(prev => [...prev, { role: 'assistant', content: '連線失敗：' + String(e) }]);
    } finally {
      setLoading(false);
    }
  };
  
  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl h-[600px] flex flex-col">
        <div className="px-6 py-4 border-b flex items-center justify-between bg-gradient-to-r from-indigo-500 to-purple-500 text-white rounded-t-2xl">
          <h3 className="font-bold text-lg">🤖 AI 智能助手</h3>
          <button onClick={onClose} className="hover:bg-white/20 p-2 rounded-lg transition-colors">✕</button>
        </div>
        
        <div className="flex-1 overflow-y-auto p-6 space-y-4">
          {messages.length === 0 && (
            <div className="text-center text-slate-400 mt-12">
              <p className="text-4xl mb-4">💬</p>
              <p>問我任何問題！</p>
            </div>
          )}
          {messages.map((msg, i) => (
            <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
              <div className={`max-w-[80%] px-4 py-3 rounded-2xl ${
                msg.role === 'user' 
                  ? 'bg-indigo-500 text-white' 
                  : 'bg-slate-100 text-slate-800'
              }`}>
                {msg.content}
              </div>
            </div>
          ))}
          {loading && (
            <div className="flex justify-start">
              <div className="bg-slate-100 px-4 py-3 rounded-2xl text-slate-400">
                思考中...
              </div>
            </div>
          )}
        </div>
        
        <div className="p-4 border-t">
          <div className="flex gap-2">
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyPress={(e) => e.key === 'Enter' && sendMessage()}
              placeholder="輸入訊息..."
              className="flex-1 px-4 py-3 border rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500"
              disabled={loading}
            />
            <button
              onClick={sendMessage}
              disabled={loading || !input.trim()}
              className="px-6 py-3 bg-indigo-500 text-white rounded-xl font-medium hover:bg-indigo-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              發送
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

// 6. Dashboard Main Component
const Dashboard = ({ transactions, loading, error, onRefresh, user }) => {
  const [yearFilter, setYearFilter] = useState('All');
  const [quarterFilter, setQuarterFilter] = useState('All');
  const [monthFilter, setMonthFilter] = useState<Set<string>>(new Set()); // 空 Set = 全月份
  const [statusFilter, setStatusFilter] = useState('All'); 
  const [agentFilter, setAgentFilter] = useState('All');
  const [industryFilter, setIndustryFilter] = useState('All'); 
  const [selectedBD, setSelectedBD] = useState(null);
  const [selectedIndustry, setSelectedIndustry] = useState(null); 
  const [selectedClient, setSelectedClient] = useState(null); 
  const [selectedStatus, setSelectedStatus] = useState(null); 
  const [showAllDetails, setShowAllDetails] = useState(false);
  const [includeIherb, setIncludeIherb] = useState(true); // true=包含Iherb, false=排除Iherb
  const [showAgentRanking, setShowAgentRanking] = useState(false);
  const [showIndustryRanking, setShowIndustryRanking] = useState(false);
  const [chatOpen, setChatOpen] = useState(false);
  // 固定匯率顯示用（實際換算在 fetchData 內：USD×30, HKD×4）
  
  // 固定匯率：USD × 30，HKD × 4（已移至 fetchData，此處僅保留顯示用）
  // const exchangeRate = 30; // 不再動態更新

  // 動態決定：2026+ 顯示 BU，2025- 顯示業務
  const useBuFilter = yearFilter !== 'All' && parseInt(yearFilter) >= 2026;
  
  const { availableYears, availableOptions, availableStatuses, availableIndustries } = useMemo(() => {
    const years = new Set();
    const agents = new Set();
    const bus = new Set();
    const statuses = new Set();
    const industries = new Set();
    
    transactions.forEach(t => {
        // 優先用已計算好的 year，fallback 到 date 前4碼
        const y = t.year || (t.date && typeof t.date === 'string' ? t.date.substring(0, 4) : '');
        if (y && y.length === 4 && /^\d{4}$/.test(y)) years.add(y);
        
        // 收集業務和 BU
        if (t.agentName) {
            agents.add(t.agentName);
            const bu = getTransactionBU(t);
            if (bu) bus.add(bu);
        }
        
        if (t.status) statuses.add(t.status);
        if (t.industry) industries.add(t.industry);
    });
    
    // 根據 yearFilter 決定回傳 BU 或業務
    const shouldUseBu = yearFilter !== 'All' && parseInt(yearFilter) >= 2026;
    const options = shouldUseBu 
        ? ['BU1', 'BU2', 'BU3'].filter(bu => bus.has(bu))  // 只顯示有資料的 BU
        : Array.from(agents).sort();
    
    return { 
        availableYears: Array.from(years).sort().reverse(), 
        availableOptions: options,
        availableStatuses: Array.from(statuses).sort(), 
        availableIndustries: Array.from(industries).sort() 
    };
  }, [transactions, yearFilter]);

  const clientCounts = useMemo(() => {
      const counts = {};
      transactions.forEach(t => {
          const clientName = t.brandName || t.projectName || 'Unknown';
          counts[clientName] = (counts[clientName] || 0) + 1;
      });
      return counts;
  }, [transactions]);
  
  // yearFilter 改變時，清除 agentFilter（因為 2026+ 是 BU，2025- 是業務）
  useEffect(() => {
      setAgentFilter('All');
  }, [yearFilter]);

  const filteredData = useMemo(() => {
    return transactions.filter(t => {
        if (!t.date) return false;
        // 從標準化後的 YYYY-MM-DD 日期取年、月
        // date 已經過 fetchData 標準化，格式是 YYYY-MM-DD
        const tYear = t.date.substring(0, 4);
        const tMonthRaw = t.date.length >= 7 ? t.date.substring(5, 7) : '0';
        const tMonth = parseInt(tMonthRaw, 10);
        const tQuarter = Math.ceil(tMonth / 3);
        if (yearFilter !== 'All' && tYear !== yearFilter) return false;
        if (quarterFilter !== 'All' && String(tQuarter) !== quarterFilter) return false;
        if (monthFilter.size > 0 && !monthFilter.has(String(tMonth))) return false;
        if (statusFilter !== 'All' && t.status !== statusFilter) return false;
        // 業務/BU 篩選：2026+ 用 BU，2025- 用業務名稱
        if (agentFilter !== 'All') {
            if (useBuFilter) {
                // BU 模式：檢查業務是否屬於選定的 BU
                const bu = getTransactionBU(t);
                // Debug: 輸出 BU 判斷結果
                if (Math.random() < 0.02) {
                    console.log('[BU Filter]', 't.bu:', t.bu, '→ 判斷:', bu, '| agentFilter:', agentFilter, '| 通過:', bu === agentFilter);
                }
                if (bu !== agentFilter) return false;
            } else {
                // 業務模式：直接比對業務名稱
                if (t.agentName !== agentFilter) return false;
            }
        }
        if (industryFilter !== 'All' && t.industry !== industryFilter) return false;
        // Iherb 開關
        const isIherbRow = (t.brandName || '').toLowerCase().includes('iherb') || (t.projectName || '').toLowerCase().includes('iherb') || (t.agentName || '').toLowerCase().includes('iherb');
        if (!includeIherb && isIherbRow) return false;
        return true;
    });
  }, [transactions, yearFilter, quarterFilter, monthFilter, statusFilter, agentFilter, industryFilter, includeIherb]); // monthFilter 是 Set，React 用 reference 比較

  const stats = useMemo(() => {
    let totalRevenue = 0;
    const bdMap = {};
    const industryMap = {};
    const clientMap = {};
    
    filteredData.forEach(t => {
      totalRevenue += t.finalAmount;
      
      // BD Stats：2026+ 按 BU 聚合，2025- 按業務聚合
      let bdName: string;
      if (useBuFilter) {
          const bu = getTransactionBU(t);
          bdName = bu || 'Unknown';
      } else {
          bdName = t.agentName || 'Unknown';
      }
      if (!bdMap[bdName]) bdMap[bdName] = { name: bdName, revenue: 0, count: 0 };
      bdMap[bdName].revenue += t.finalAmount;
      bdMap[bdName].count += 1;
      
      // Industry Stats
      const indName = t.industry || '未分類';
      if (!industryMap[indName]) industryMap[indName] = { name: indName, revenue: 0, count: 0 };
      industryMap[indName].revenue += t.finalAmount;
      industryMap[indName].count += 1;
      
      // Client Stats (Using Brand Name)
      const brandName = t.brandName || t.projectName || 'Unknown';
      if (!clientMap[brandName]) clientMap[brandName] = { name: brandName, revenue: 0, count: 0 };
      clientMap[brandName].revenue += t.finalAmount;
      clientMap[brandName].count += 1;
    });

    const bdRanking = Object.values(bdMap).sort((a, b) => b.revenue - a.revenue);
    const industryRanking = Object.values(industryMap).map(ind => ({ ...ind, share: totalRevenue > 0 ? Math.round((ind.revenue / totalRevenue) * 100) : 0 })).sort((a, b) => b.revenue - a.revenue);
    const clientRanking = Object.values(clientMap).sort((a, b) => b.revenue - a.revenue).slice(0, 50);
    
    return { totalRevenue, bdRanking, industryRanking, clientRanking, totalCount: filteredData.length };
  }, [filteredData, useBuFilter]);

  if (error) return (<div className="p-12 flex flex-col items-center justify-center text-center h-full"><div className="bg-red-50 p-6 rounded-full mb-6 shadow-sm"><AlertCircle size={56} className="text-red-500" /></div><h3 className="text-2xl font-bold text-slate-800 mb-3">資料讀取失敗</h3><p className="text-slate-500 mb-8 max-w-lg">{error}</p><button onClick={onRefresh} className="px-6 py-3 bg-blue-600 text-white rounded-xl font-bold shadow-lg">重試連線</button></div>);
  
  if (loading && transactions.length === 0) return (<div className="flex flex-col items-center justify-center h-96 text-center"><RefreshCw className="animate-spin text-indigo-600 mb-4" size={40}/><p className="text-slate-500">正在更新資料...</p></div>);

  return (
    <div className="space-y-8 relative max-w-[1600px] mx-auto pb-12">
      {chatOpen && <ChatPanel onClose={() => setChatOpen(false)} user={user} />}
      {selectedBD && <DetailModal title={selectedBD} icon={Users} transactions={filteredData.filter(t => {
        // BU 模式：比對 BU，業務模式：比對 agentName
        if (useBuFilter) {
          const bu = getTransactionBU(t);
          return bu === selectedBD;
        } else {
          return (t.agentName || 'Unknown') === selectedBD;
        }
      })} onClose={() => setSelectedBD(null)} />}
      {selectedIndustry && <DetailModal title={selectedIndustry} icon={Briefcase} transactions={filteredData.filter(t => (t.industry || '未分類') === selectedIndustry)} onClose={() => setSelectedIndustry(null)} />}
      {selectedClient && <DetailModal title={selectedClient} icon={Building2} transactions={filteredData.filter(t => (t.brandName || t.projectName || 'Unknown') === selectedClient)} onClose={() => setSelectedClient(null)} />}
      {selectedStatus && <DetailModal title={selectedStatus} icon={CheckCircle} transactions={filteredData.filter(t => t.status === selectedStatus)} onClose={() => setSelectedStatus(null)} />}
      {showAllDetails && <DetailModal title="當期全體案件明細" icon={List} transactions={filteredData} onClose={() => setShowAllDetails(false)} />}
      {showAgentRanking && <RankingModal title="活躍業務排行榜" data={stats.bdRanking} onClose={() => setShowAgentRanking(false)} type="agent" />}
      {showIndustryRanking && <RankingModal title="產業分佈列表" data={stats.industryRanking} onClose={() => setShowIndustryRanking(false)} type="industry" />}

      {/* Filter Bar */}
      <div className="bg-white p-5 rounded-2xl shadow-sm border border-slate-100 space-y-4 sticky top-0 z-20 backdrop-blur-xl bg-white/90">
        <div className="flex flex-wrap items-center gap-3">
           <div className="flex items-center space-x-0.5 p-1 bg-slate-100 rounded-xl border border-slate-200"><select className="bg-transparent text-sm py-2 pl-3 pr-8 font-semibold text-slate-700 outline-none cursor-pointer" value={yearFilter} onChange={e => setYearFilter(e.target.value)}>{availableYears.map(y => <option key={y} value={y}>{y} 年</option>)}<option value="All">全部年份</option></select><div className="w-px h-6 bg-slate-300 mx-1"></div><select className="bg-transparent text-sm py-2 pl-3 pr-8 font-medium text-slate-600 outline-none cursor-pointer" value={quarterFilter} onChange={e => setQuarterFilter(e.target.value)}><option value="All">全季度</option>{[1,2,3,4].map(q => <option key={q} value={q}>Q{q}</option>)}</select><div className="w-px h-6 bg-slate-300 mx-1"></div>
                    {/* 月份複選 dropdown */}
                    <div className="relative group/month">
                      <button className="flex items-center gap-1 text-sm py-2 pl-3 pr-8 font-medium text-slate-600 outline-none cursor-pointer hover:text-indigo-600 transition-colors">
                        {monthFilter.size === 0 ? '全月份' : `已選 ${monthFilter.size} 月`}
                        <span className="text-xs ml-1">▾</span>
                      </button>
                      <div className="absolute left-0 top-full mt-1 bg-white border border-slate-200 rounded-2xl shadow-xl p-3 z-50 w-52 hidden group-hover/month:block">
                        <div className="flex items-center justify-between mb-2">
                          <span className="text-xs font-semibold text-slate-500 uppercase tracking-wide">選擇月份（可複選）</span>
                          {monthFilter.size > 0 && <button onClick={() => setMonthFilter(new Set())} className="text-xs text-indigo-500 hover:text-indigo-700 font-medium">清除</button>}
                        </div>
                        <div className="grid grid-cols-3 gap-1.5">
                          {Array.from({length: 12}, (_, i) => i + 1).map(m => {
                            const selected = monthFilter.has(String(m));
                            return (
                              <button key={m} onClick={() => {
                                const next = new Set(monthFilter);
                                if (selected) next.delete(String(m)); else next.add(String(m));
                                setMonthFilter(next);
                              }} className={`text-xs py-1.5 rounded-lg font-medium transition-all ${selected ? 'bg-indigo-500 text-white shadow-sm' : 'bg-slate-100 text-slate-600 hover:bg-indigo-50 hover:text-indigo-600'}`}>
                                {m}月
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    </div></div>
           <div className="h-8 w-px bg-slate-200 mx-2 hidden md:block"></div>
           <select className="bg-white border border-slate-200 rounded-xl text-sm py-2.5 pl-3 pr-8 outline-none focus:ring-2 focus:ring-indigo-100 hover:border-indigo-300 transition-all shadow-sm" value={agentFilter} onChange={e => setAgentFilter(e.target.value)}>
             <option value="All">{useBuFilter ? '🏢 所有 BU' : '👨‍💼 所有業務'}</option>
             {availableOptions.map(a => <option key={a} value={a}>{a}</option>)}
           </select>
           <select className="bg-white border border-slate-200 rounded-xl text-sm py-2.5 pl-3 pr-8 outline-none focus:ring-2 focus:ring-indigo-100 hover:border-indigo-300 transition-all shadow-sm" value={industryFilter} onChange={e => setIndustryFilter(e.target.value)}><option value="All">🏭 所有產業</option>{availableIndustries.map(i => <option key={i} value={i}>{i}</option>)}</select>
           <select className="bg-white border border-slate-200 rounded-xl text-sm py-2.5 pl-3 pr-8 outline-none focus:ring-2 focus:ring-indigo-100 hover:border-indigo-300 transition-all shadow-sm" value={statusFilter} onChange={e => setStatusFilter(e.target.value)}><option value="All">🏷️ 新舊客篩選 (全部)</option><option value="新客戶">✨ 新客戶</option><option value="續約客戶">🤝 續約客戶</option></select>
           {/* Iherb 開關 */}
           <button
             onClick={() => setIncludeIherb(prev => !prev)}
             className={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-sm font-medium border transition-all shadow-sm ${
               includeIherb
                 ? 'bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100'
                 : 'bg-slate-100 text-slate-400 border-slate-200 hover:bg-slate-200 line-through'
             }`}
             title={includeIherb ? '點擊排除 iHerb 客戶' : '點擊加入 iHerb 客戶'}
           >
             <span className="text-base leading-none">🌿</span>
             <span>iHerb</span>
             <span className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold ${includeIherb ? 'bg-emerald-500 text-white' : 'bg-slate-300 text-slate-500'}`}>
               {includeIherb ? '✓' : '✕'}
             </span>
           </button>
           <div className="ml-auto flex items-center gap-3">
               {loading && <div className="flex items-center text-xs text-indigo-500 bg-indigo-50 px-2 py-1 rounded-lg animate-pulse"><RefreshCw size={12} className="animate-spin mr-1"/> 更新中...</div>}
               <div className="hidden lg:flex items-center bg-amber-50 text-amber-700 px-3 py-1.5 rounded-full text-xs font-medium border border-amber-100 shadow-sm"><Globe size={12} className="mr-1.5"/> 固定匯率: USD×30 / HKD×4</div>
               <button onClick={onRefresh} disabled={loading} className="p-2.5 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-full transition-all active:scale-95" title="重新整理"><RefreshCw size={18} className={loading ? 'animate-spin' : ''} /></button>
           </div>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
           <div onClick={() => setShowAllDetails(true)} className="bg-gradient-to-br from-indigo-500 to-violet-600 p-6 rounded-2xl shadow-lg shadow-indigo-200 text-white relative overflow-hidden group cursor-pointer hover:shadow-xl hover:scale-[1.02] transition-all duration-300">
              <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity"><DollarSign size={100} /></div>
              <p className="text-indigo-100 text-sm font-medium mb-2 flex items-center"><DollarSign size={14} className="mr-1"/>總業績 (TWD)</p>
              <p className="text-3xl font-bold tracking-tight">{formatCurrency(stats.totalRevenue)}</p>
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
        {/* Rankings Tables - BD Performance */}
        <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden flex flex-col h-full">
          <div className="px-6 py-5 border-b border-slate-100 flex justify-between items-center bg-slate-50/50"><h3 className="font-bold text-slate-800 flex items-center text-lg"><div className="bg-indigo-100 p-1.5 rounded-lg mr-3 text-indigo-600"><Users size={18}/></div>業務表現</h3></div>
          <div className="overflow-x-auto max-h-[500px]"><table className="w-full text-sm"><thead className="sticky top-0 bg-white z-10 shadow-sm text-slate-500 font-semibold text-xs uppercase tracking-wider"><tr><th className="px-6 py-4 text-left bg-slate-50/80 backdrop-blur">業務</th><th className="px-6 py-4 text-right bg-slate-50/80 backdrop-blur">總業績</th><th className="px-4 py-4 bg-slate-50/80 backdrop-blur w-10"></th></tr></thead><tbody className="divide-y divide-slate-50">{stats.bdRanking.map((bd, idx) => (<tr key={bd.name} onClick={() => setSelectedBD(bd.name)} className="hover:bg-indigo-50/50 cursor-pointer group transition-all duration-200"><td className="px-6 py-4 font-medium text-slate-700 flex items-center"><div className={`w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold mr-3 ${idx < 3 ? 'bg-amber-100 text-amber-700' : 'bg-slate-100 text-slate-500'}`}>{idx + 1}</div>{bd.name}</td><td className="px-6 py-4 text-right font-bold text-indigo-600 font-mono text-base">{formatCurrency(bd.revenue)}</td><td className="px-4 py-4 text-center text-slate-300 group-hover:text-indigo-400 transition-colors"><ChevronRight size={16} /></td></tr>))}</tbody></table></div>
        </div>
        
        {/* Rankings Tables - Industry Analysis */}
        <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden flex flex-col h-full">
          <div className="px-6 py-5 border-b border-slate-100 flex justify-between items-center bg-slate-50/50"><h3 className="font-bold text-slate-800 flex items-center text-lg"><div className="bg-emerald-100 p-1.5 rounded-lg mr-3 text-emerald-600"><Briefcase size={18} /></div>產業分析</h3></div>
          <div className="overflow-x-auto max-h-[500px]"><table className="w-full text-sm"><thead className="sticky top-0 bg-white z-10 shadow-sm text-slate-500 font-semibold text-xs uppercase tracking-wider"><tr><th className="px-6 py-4 text-left bg-slate-50/80 backdrop-blur">產業</th><th className="px-6 py-4 text-right bg-slate-50/80 backdrop-blur">貢獻業績</th><th className="px-6 py-4 text-left bg-slate-50/80 backdrop-blur w-1/3">佔比</th><th className="px-4 py-4 bg-slate-50/80 backdrop-blur w-10"></th></tr></thead><tbody className="divide-y divide-slate-50">{stats.industryRanking.map(ind => (<tr key={ind.name} onClick={() => setSelectedIndustry(ind.name)} className="hover:bg-emerald-50/50 cursor-pointer group transition-all duration-200"><td className="px-6 py-4 font-medium text-slate-700">{ind.name}</td><td className="px-6 py-4 text-right font-bold text-emerald-700 font-mono">{formatCurrency(ind.revenue)}</td><td className="px-6 py-4 align-middle"><div className="flex items-center gap-3"><div className="h-2 w-full bg-slate-100 rounded-full overflow-hidden flex-1"><div className="h-full bg-emerald-500 rounded-full transition-all duration-500 ease-out" style={{width: `${ind.share}%`}}></div></div><span className="text-xs font-medium text-slate-500 w-10 text-right">{ind.share}%</span></div></td><td className="px-4 py-4 text-center text-slate-300 group-hover:text-emerald-400 transition-colors"><ChevronRight size={16} /></td></tr>))}</tbody></table></div>
        </div>
        
        {/* Rankings Tables - Brand Revenue Ranking */}
        <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden flex flex-col h-full">
          <div className="px-6 py-5 border-b border-slate-100 flex justify-between items-center bg-slate-50/50"><h3 className="font-bold text-slate-800 flex items-center text-lg"><div className="bg-amber-100 p-1.5 rounded-lg mr-3 text-amber-600"><Building2 size={18} /></div>品牌營收排行 (Top 50)</h3></div>
          <div className="overflow-x-auto max-h-[500px]"><table className="w-full text-sm"><thead className="sticky top-0 bg-white z-10 shadow-sm text-slate-500 font-semibold text-xs uppercase tracking-wider"><tr><th className="px-6 py-4 text-left bg-slate-50/80 backdrop-blur">品牌名稱</th><th className="px-6 py-4 text-right bg-slate-50/80 backdrop-blur">貢獻業績</th><th className="px-4 py-4 bg-slate-50/80 backdrop-blur w-10"></th></tr></thead><tbody className="divide-y divide-slate-50">{stats.clientRanking.map((client, idx) => (<tr key={client.name} onClick={() => setSelectedClient(client.name)} className="hover:bg-amber-50/50 cursor-pointer group transition-all duration-200"><td className="px-6 py-4 font-medium text-slate-700 flex items-center"><div className={`w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold mr-3 ${idx < 3 ? 'bg-rose-100 text-rose-700' : 'bg-slate-100 text-slate-500'}`}>{idx + 1}</div><span className="truncate max-w-[150px]" title={client.name}>{client.name}</span></td><td className="px-6 py-4 text-right font-bold text-amber-600 font-mono">{formatCurrency(client.revenue)}</td><td className="px-4 py-4 text-center text-slate-300 group-hover:text-amber-400 transition-colors"><ChevronRight size={16} /></td></tr>))}</tbody></table></div>
        </div>
      </div>
      {/* AI 助手按鈕 */}
      <button
        onClick={() => setChatOpen(true)}
        className="fixed bottom-6 right-6 w-14 h-14 bg-gradient-to-r from-indigo-500 to-purple-500 text-white rounded-full shadow-xl hover:shadow-2xl hover:scale-110 transition-all flex items-center justify-center text-2xl z-40"
        title="AI 智能助手"
      >
        🤖
      </button>
    </div>
  );
};

// Change Password Screen
const ChangePasswordScreen = ({ onSave, email, onCancel }) => {
    const [newPass, setNewPass] = useState('');
    const [confirmPass, setConfirmPass] = useState('');
    const [loading, setLoading] = useState(false);

    const handleSubmit = async () => {
        if (newPass !== confirmPass) return alert('密碼不一致');
        if (newPass.length < 4) return alert('密碼太短');
        setLoading(true);
        const res = await onSave(email, newPass);
        setLoading(false);
        if (res.status === 'success') {
            alert('密碼修改成功，請重新登入');
            onCancel(); 
        } else {
            alert('修改失敗: ' + res.message);
        }
    };

    return (
        <div className="min-h-screen flex flex-col items-center justify-center bg-slate-50 p-4">
            <div className="bg-white p-8 rounded-3xl shadow-xl w-full max-w-md text-center border border-slate-100">
                <h2 className="text-2xl font-bold text-slate-800 mb-4">設定新密碼</h2>
                <p className="text-sm text-slate-500 mb-6">為了帳戶安全，請修改您的預設密碼。</p>
                <input type="password" className="w-full border p-3 rounded-xl mb-3" placeholder="新密碼" value={newPass} onChange={e => setNewPass(e.target.value)} />
                <input type="password" className="w-full border p-3 rounded-xl mb-6" placeholder="確認新密碼" value={confirmPass} onChange={e => setConfirmPass(e.target.value)} />
                <button onClick={handleSubmit} disabled={loading} className="w-full bg-indigo-600 text-white py-3 rounded-xl font-bold">{loading ? '儲存中...' : '確認修改'}</button>
            </div>
        </div>
    );
};

// Google OAuth Client ID（對應 GAS 後端設定）
const GOOGLE_CLIENT_ID = "698614062049-6vmanoc4639ju33p8innvo4c1355sv72.apps.googleusercontent.com";

// 全域 callback：Google GSI SDK 呼叫此函數
(window as any).__vgv_google_callback = null;

// --- Login Screen（Google 登入）---
const LoginScreen = ({ onGoogleLogin, error, loading }) => {
  const btnRef = useRef<HTMLDivElement>(null);
  const [sdkReady, setSdkReady] = useState(false);
  const [sdkError, setSdkError] = useState(false);

  // 設定全域 callback（讓 GSI SDK 能呼叫）
  useEffect(() => {
    (window as any).__vgv_google_callback = (resp: any) => {
      if (resp?.credential) onGoogleLogin(resp.credential);
    };
    return () => { (window as any).__vgv_google_callback = null; };
  }, [onGoogleLogin]);

  // 載入 / 初始化 Google SDK
  useEffect(() => {
    let cancelled = false;

    const initSDK = () => {
      if (cancelled) return;
      const g = (window as any).google?.accounts?.id;
      if (!g) { setSdkError(true); return; }
      try {
        g.initialize({
          client_id: GOOGLE_CLIENT_ID,
          callback: (resp: any) => {
            if (resp?.credential) onGoogleLogin(resp.credential);
          },
          // 不設 ux_mode（預設 popup），但如果 popup 被阻擋會自動 fallback 到 redirect
          // 不設 auto_select（避免無限迴圈）
          // 不設 cancel_on_tap_outside（避免誤關）
        });
        if (!cancelled) setSdkReady(true);
      } catch(e) {
        if (!cancelled) setSdkError(true);
      }
    };

    // 不管 script 是否存在，都用 polling 等 google.accounts.id 就緒
    // 最多等 8 秒
    const startTime = Date.now();
    const poll = setInterval(() => {
      if (cancelled) { clearInterval(poll); return; }
      if ((window as any).google?.accounts?.id) {
        clearInterval(poll);
        initSDK();
        return;
      }
      if (Date.now() - startTime > 8000) {
        clearInterval(poll);
        if (!cancelled) setSdkError(true);
      }
    }, 150);

    // 如果 script 還沒載入，動態加入
    const scriptId = 'gsi-sdk';
    if (!document.getElementById(scriptId)) {
      const script = document.createElement('script');
      script.id = scriptId;
      script.src = 'https://accounts.google.com/gsi/client';
      script.async = true;
      script.defer = true;
      script.onerror = () => { if (!cancelled) setSdkError(true); };
      document.head.appendChild(script);
    }

    return () => { 
      cancelled = true;
      // 清理時確保 Google One Tap 不會自動顯示
      try {
        const g = (window as any).google?.accounts?.id;
        if (g?.cancel) g.cancel();
      } catch(e) {}
    };
  }, []);

  // SDK 就緒後渲染按鈕
  useEffect(() => {
    if (!sdkReady || !btnRef.current) return;
    const g = (window as any).google?.accounts?.id;
    if (!g) return;
    // 清空舊按鈕避免重複渲染
    btnRef.current.innerHTML = '';
    g.renderButton(btnRef.current, {
      type: 'standard',
      theme: 'outline',
      size: 'large',
      text: 'signin_with',
      shape: 'pill',
      logo_alignment: 'left',
      width: 320,
      locale: 'zh-TW',
    });
  }, [sdkReady]);

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-slate-50 p-4">
      <div className="bg-white p-8 rounded-3xl shadow-xl shadow-slate-200 w-full max-w-md text-center border border-slate-100">
        <div className="flex justify-center mb-6">
          <img src="https://i.meee.com.tw/IxrjkVS.png" alt="VGV Logo" className="h-24 object-contain mb-2" />
        </div>
        <h2 className="text-3xl font-bold text-slate-800 mb-2">Data-Driven Hub</h2>
        <p className="text-slate-500 mb-8 text-sm font-medium tracking-wide">VGV Media Asia</p>

        {error && !loading && (
          <div className="mb-6 text-sm bg-red-50 p-4 rounded-xl border border-red-100 text-left">
            <div className="flex items-start gap-2 text-red-600 mb-2">
              <AlertCircle size={16} className="mt-0.5 shrink-0"/>
              <span className="font-medium">{error}</span>
            </div>
            {error.includes('CORS') || error.includes('無法連接') || error.includes('HTML') ? (
              <div className="text-red-500 text-xs mt-2 pl-6">
                <p className="font-semibold mb-1">解決方法：</p>
                <p>前往 GAS 編輯器 → 部署 → 管理部署 → 編輯</p>
                <p>將「存取權」改為 <strong>「所有人」（不需要 Google 帳號）</strong></p>
                <p>儲存後重新部署即可</p>
              </div>
            ) : null}
          </div>
        )}

        {loading ? (
          <div className="flex flex-col items-center justify-center py-8 gap-3">
            <RefreshCw className="animate-spin text-indigo-500" size={32}/>
            <span className="text-slate-500 text-sm font-medium">驗證中，請稍候...</span>
          </div>
        ) : sdkError ? (
          <div className="flex flex-col items-center gap-4 py-4">
            <div className="text-amber-600 text-sm bg-amber-50 p-3 rounded-xl border border-amber-100 flex items-center gap-2">
              <AlertCircle size={16}/>
              <span>Google 登入載入失敗，請重新整理頁面</span>
            </div>
            <button
              onClick={() => window.location.reload()}
              className="px-6 py-2.5 bg-indigo-600 text-white rounded-xl font-bold hover:bg-indigo-700 transition-all flex items-center gap-2"
            >
              <RefreshCw size={16}/> 重新整理
            </button>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-5">
            <p className="text-slate-500 text-sm">請使用公司 Google 帳號登入</p>
            {/* Google 官方按鈕容器 */}
            <div ref={btnRef} className="flex justify-center min-h-[44px] w-full" />
            {!sdkReady && (
              <div className="flex items-center gap-2 text-slate-400 text-xs">
                <RefreshCw size={12} className="animate-spin"/> 載入 Google 登入...
              </div>
            )}
            <p className="text-xs text-slate-400">僅限 VGV Media Asia 授權帳號</p>
          </div>
        )}
      </div>
      <p className="mt-8 text-xs text-slate-400">Protected by VGV Media Asia</p>
    </div>
  );
};

// --- Main App Component ---
export default function SalesApp() {
  const [user, setUser] = useState(null);
  const [isChangePass, setIsChangePass] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [transactions, setTransactions] = useState([]);
  const [adminUsers, setAdminUsers] = useState([]); 
  const [activeTab, setActiveTab] = useState('dashboard');

  const gasUrl = DEFAULT_GAS_URL; 

  // 1. Check LocalStorage for existing session
  useEffect(() => {
      const savedUser = localStorage.getItem('vgv_user');
      const savedToken = localStorage.getItem('vgv_token');
      if (savedUser && savedToken) {
          try {
              const parsedUser = JSON.parse(savedUser);
              setUser(parsedUser);
              const savedData = localStorage.getItem('vgv_data');
              if (savedData) setTransactions(JSON.parse(savedData));
              // fetchData 失敗不顯示錯誤，靜默清除 session 讓使用者重新 Google 登入
              fetchData(parsedUser, savedToken).catch(() => {
                  localStorage.removeItem('vgv_user');
                  localStorage.removeItem('vgv_data');
                  localStorage.removeItem('vgv_token');
                  setUser(null);
                  setTransactions([]);
              });
          } catch(e) {
              localStorage.removeItem('vgv_user');
              localStorage.removeItem('vgv_token');
          }
      } else {
          // 沒有完整 session，清除舊殘留資料
          localStorage.removeItem('vgv_user');
          localStorage.removeItem('vgv_data');
          localStorage.removeItem('vgv_token');
      }
  }, []);

  const handleGoogleLogin = async (credential: string) => {
      // 防止重複呼叫（Google SDK 有時會觸發多次 callback）
      if (loading) {
          console.log('登入中，忽略重複請求');
          return;
      }
      
      setLoading(true);
      setError('');
      try {
          const json = await gasLoginPost(gasUrl, credential);

          if (json.status === 'success') {
              setUser(json.user);
              localStorage.setItem('vgv_user', JSON.stringify(json.user));
              localStorage.setItem('vgv_token', json.token);
              fetchData(json.user, json.token);
          } else if (json.status === 'pending') {
              setError('帳號申請已送出，請等待管理員開通權限（' + (json.email || '') + '）');
          } else {
              setError(json.message || '登入失敗');
          }
      } catch (e) {
          console.error('GAS 連線失敗:', e);
          // CORS 錯誤時給出明確指引
          // TypeError = 網路失敗（CORS block 或斷線），都顯示 CORS 提示
          const errMsg = String((e as any)?.message || e);
          const isCors = e instanceof TypeError || errMsg.includes('HTML') || errMsg.includes('Failed to fetch');
          const msg = isCors
              ? 'GAS 連線被阻擋（CORS）：請確認 GAS Web App 部署設定為「存取：所有人（包含匿名）」'
              : `連線失敗：${errMsg}`;
          setError(msg);
      } finally {
          setLoading(false);
      }
  };

  // Google 登入不需要密碼管理
  const handleSavePassword = async (_email: string, _newPassword: string) => {
      return { status: 'error', message: '此功能已停用，請使用 Google 帳號登入' };
  };

  const fetchData = async (currentUser, token?: string) => {
      // 每次都顯示更新指示（spinner 在 Filter Bar 顯示，不影響已有資料顯示）
      setLoading(true);
      try {
          const t = token || localStorage.getItem('vgv_token') || '';
          const json = await gasPost(gasUrl, { action: 'getData', token: t });

          if (json.status === 'success') {
              const perms = (currentUser.permissions || '').toLowerCase();
              const allowedFields = perms === 'all' ? DATA_FIELDS.map(f => f.k) : perms.split(',').map(s => s.trim());

              const mappedData = json.data.map(row => {
                  const newRow: any = {};
                  const keys = Object.keys(row);

                  // 1. 金額：找「委刊單金額 (未稅)」或 canonical 'amount' key
                  let amountKey = 
                      keys.find(k => k === 'amount') ||  // GAS canonical key
                      keys.find(k => k.includes('委刊單金額') && k.includes('未稅')) ||
                      keys.find(k => /(委刊單).*?(未稅)/.test(k)) ||
                      keys.find(k => /(未稅.*金額)|(Amount.*Excl)/i.test(k));

                  // 最後防禦：只要是「金額」但排除「編號、流水號」等欄位
                  if (!amountKey) {
                      amountKey = keys.find(
                          k =>
                              /金額|Revenue/i.test(k) &&
                              !/編號|No\.?|流水|序號|Index|ID/i.test(k)
                      );
                  }

                  // 2. 業務：GAS 合成的 'agentName' 欄 或原始欄名
                  const agentKey = keys.find(k => k === 'agentName') ||
                      keys.find(k => /主要負責業務|負責業務|Sales|Agent/i.test(k));
                  
                  // 2b. BU 欄（GAS 合成）
                  const buKey = keys.find(k => k === 'bu' || k.toUpperCase() === 'BU');
                  
                  // 2c. Year 欄（GAS 合成或原始）
                  const yearKey = keys.find(k => k === 'year') ||
                      keys.find(k => /進件年度|年度/i.test(k));

                  // 3. 品牌名稱：只抓「品牌名稱 / 品牌」或「Brand Name」，避免抓到 Brand Status
                  let brandKey =
                      keys.find(k => k === '品牌名稱') ||
                      keys.find(k => k === '品牌');

                  if (!brandKey) {
                      brandKey = keys.find(
                          k =>
                              /(品牌名稱|品牌)/.test(k) &&
                              !/狀態|Status|等級|Level/i.test(k)
                      );
                  }

                  if (!brandKey) {
                      brandKey = keys.find(k => /Brand\s*Name/i.test(k));
                  }

                  // 4. 客戶全名（新舊客判定只用這個）
                  const clientFullNameKey =
                      findKeyByNormalizedMatch(keys, '客戶全名') ||
                      keys.find(k => /客戶全名/i.test(k));

                  // 5. 專案名稱
                  const projectKey = keys.find(
                      k => /專案名|專案|Project|委刊/i.test(k) && !/金額/.test(k)
                  );

                  const dateKey = keys.find(k => k === 'date') || keys.find(k => /進件日期|走期|日期|Date/i.test(k));
                  const industryKey = keys.find(k => /產業|Industry/i.test(k));
                  const statusKey = keys.find(k => /客戶新舊分類|新舊|StatusNewOld/i.test(k));
                  const countryKey = keys.find(k => /國別|Country|地區/i.test(k));
                  const currencyKey = keys.find(k => /幣別|Currency/i.test(k));

                  // 日期標準化：統一轉為 YYYY-MM-DD
                  // GAS 可能回傳 "2026/1/15"、"2026-01-15 00:00:00" 等格式
                  const rawDate = dateKey ? String(row[dateKey] || '').trim() : '';
                  if (!rawDate) {
                      newRow.date = '';
                  } else {
                      // 嘗試解析各種格式
                      const m = rawDate.match(/^(\d{4})[\/\-\.](\d{1,2})[\/\-\.](\d{1,2})/);
                      if (m) {
                          const y = m[1];
                          const mo = m[2].padStart(2, '0');
                          const d = m[3].padStart(2, '0');
                          newRow.date = `${y}-${mo}-${d}`;
                      } else {
                          newRow.date = rawDate.substring(0, 10);
                      }
                  }
                  newRow.amount = cleanNumber(amountKey ? row[amountKey] : 0);
                  newRow.currency = currencyKey ? cleanText(row[currencyKey]) : 'TWD';
                  newRow.agentName = agentKey ? cleanText(row[agentKey]) : 'Unknown';
                  newRow.brandName = brandKey
                      ? cleanText(row[brandKey])
                      : 'Unknown';
                  // clientFullName：優先找客戶全名欄，再 fallback 到 brandKey
                  newRow.clientFullName = clientFullNameKey 
                      ? cleanText(row[clientFullNameKey]) 
                      : (brandKey ? cleanText(row[brandKey]) : '');
                  newRow.projectName = projectKey ? cleanText(row[projectKey]) : 'Unknown';
                  newRow.industry = industryKey ? cleanText(row[industryKey]) : '未分類';
                  // status：GAS getData 已用「客戶全名」計算好 新客戶/續約客戶/未分類
                  // 「客戶新舊分類」欄的原始值（已合作/未合作）不是我們要的
                  // GAS 回傳的 status key 是原始欄位名，但值已被 GAS 覆寫為 新客戶/續約客戶
                  const rawStatus = statusKey ? cleanText(row[statusKey]) : '';
                  // 只接受標準的 GAS 計算結果，其他值一律視為「未分類」讓前端重算
                  const validGasStatuses = ['新客戶', '續約客戶', '未分類'];
                  newRow.status = validGasStatuses.includes(rawStatus) ? rawStatus : '未分類';
                  // country：有國別欄用國別，沒有就讓 normalizeCountry 用幣別判斷
                  // 不能直接 fallback '台灣'，否則幣別判斷失效
                  const rawCountry = countryKey ? cleanText(row[countryKey]) : '';
                  newRow.country = rawCountry;  // 先存原始值（可能為空）
                  newRow.bu = buKey ? cleanText(row[buKey]) : '';
                  // year 欄：GAS 的「進件年度」可能存整個日期如 "2026/1/15"
                  // 只取前 4 位年份數字，或從 date 欄取
                  const rawYear = yearKey ? String(row[yearKey] || '').trim() : '';
                  const yearMatch = rawYear.match(/^(\d{4})/);
                  newRow.year = yearMatch ? yearMatch[1] : (newRow.date ? String(newRow.date).slice(0, 4) : '');

                  // IHERB 特殊處理
                  const brandLower = newRow.brandName.toLowerCase();
                  const projLower = newRow.projectName.toLowerCase();
                  const isIherb = brandLower.includes('iherb') || projLower.includes('iherb');
                  if (isIherb) newRow.agentName = 'Iherb (獨立客戶)';

                  // 幣別換算：USD/美元 換算為台幣，其餘保持原值
                  const cur = (newRow.currency || '').toString().trim();
                  const isUSD = /USD|US\$|美金|美元/i.test(cur);
                  const isHKD = /HKD|港幣|港元/i.test(cur);
                  const isTWD = /TWD|臺幣|台幣|NT/i.test(cur);
                  newRow.isUSD = isUSD;
                  newRow.isHKD = isHKD;
                  newRow.originalAmount = newRow.amount;
                  // 固定匯率：USD/美金/美元 × 30，港幣 × 4，臺幣不換算
                  newRow.finalAmount = isUSD ? newRow.amount * 30
                                    : isHKD ? newRow.amount * 4
                                    : newRow.amount;

                  // 用幣別判斷台灣/海外：臺幣 = 台灣，其他所有幣別 = 海外
                  // 這是最明確的規則：只要不是臺幣就算海外
                  newRow.region = isTWD ? '台灣' : '海外';

                  return newRow;
              });

              // 新舊客：
              // 1. 若 GAS 已計算（status='新客戶'/'續約客戶'），直接用 GAS 結果
              // 2. 若 GAS 未計算（status='未分類'或空），前端用 brandName 重新計算
              const hasGasStatus = mappedData.some(r => r.status === '新客戶' || r.status === '續約客戶');
              if (!hasGasStatus) {
                  assignNewOldByCompany(mappedData);
              }

              setTransactions(mappedData);
              localStorage.setItem('vgv_data', JSON.stringify(mappedData));
          }
      } catch (e) {
          console.error('fetchData 失敗:', e);
          throw e;  // re-throw 讓 useEffect .catch() 能清除過期 session
      } finally {
          setLoading(false);
      }
  };
  
  const fetchUsers = async () => {
      if (user?.role !== 'admin') return;
      const t = localStorage.getItem('vgv_token') || '';
      const json = await gasPost(gasUrl, { action: 'getUsers', token: t });
      if (json.status === 'success') setAdminUsers(json.users);
  };

  const saveUserConfig = async (userData, isReset = false) => {
      const t = localStorage.getItem('vgv_token') || '';
      if (!t) {
          console.error('[saveUserConfig] 無 token，請重新登入');
          return { status: 'error', message: '無授權 token，請重新登入' };
      }
      
      const params: Record<string, string> = {
          action: 'saveUser', 
          token: t, 
          targetEmail: userData.email,
          role: userData.role || 'viewer',
          permissions: userData.permissions || '',
          name: userData.name || '',
      };
      
      console.log('[saveUserConfig] 儲存使用者:', userData.email);
      console.log('[saveUserConfig] 參數:', params);
      
      try {
          const result = await gasPost(gasUrl, params);
          console.log('[saveUserConfig] GAS 回應:', result);
          
          if (result.status === 'success') {
              console.log('✅ 儲存成功:', userData.email);
          } else {
              console.error('❌ GAS 回傳錯誤:', result.message);
          }
          
          return result;
      } catch (e) {
          console.error('[saveUserConfig] 網路錯誤:', e);
          return { status: 'error', message: '連線失敗：' + String(e) };
      }
  };

  const handleLogout = () => {
      setUser(null);
      setIsChangePass(false);
      setTransactions([]);
      localStorage.removeItem('vgv_user');
      localStorage.removeItem('vgv_data');
      localStorage.removeItem('vgv_token');
      // 撤銷 Google session
      if ((window as any).google?.accounts?.id) {
          (window as any).google.accounts.id.disableAutoSelect();
      }
  };

  useEffect(() => {
      if (activeTab === 'settings' && user?.role === 'admin') fetchUsers();
  }, [activeTab, user]);

  if (!user) return <LoginScreen onGoogleLogin={handleGoogleLogin} error={error} loading={loading} />;
  // Google 登入不需要密碼更改流程

  return (
    <div className="min-h-screen bg-slate-50 font-sans text-slate-900 selection:bg-indigo-100">
      <ErrorBoundary>
        <div className="flex flex-col lg:flex-row min-h-screen max-w-[1920px] mx-auto">
          <aside className="w-full lg:w-72 bg-white lg:min-h-screen shadow-xl shadow-slate-200/50 border-r border-slate-100 z-10 flex flex-col">
            <div className="p-8 hidden lg:flex items-center gap-3">
              <div className="bg-indigo-600 text-white p-2.5 rounded-xl shadow-lg shadow-indigo-200"><LayoutDashboard size={24} /></div>
              <h1 className="text-xl font-bold text-slate-800 tracking-tight">Data-Driven Hub</h1>
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
              <button onClick={() => setActiveTab('dashboard')} className={`flex items-center px-5 py-3.5 rounded-xl text-sm font-bold transition-all duration-200 ${activeTab === 'dashboard' ? 'bg-indigo-50 text-indigo-600 shadow-sm' : 'text-slate-500 hover:bg-slate-50 hover:text-slate-900'}`}><TrendingUp size={20} className="mr-3" />總覽儀表板</button>
              {user.role === 'admin' && (
                  <button onClick={() => setActiveTab('settings')} className={`flex items-center px-5 py-3.5 rounded-xl text-sm font-bold transition-all duration-200 ${activeTab === 'settings' ? 'bg-indigo-50 text-indigo-600 shadow-sm' : 'text-slate-500 hover:bg-slate-50 hover:text-slate-900'}`}><Settings size={20} className="mr-3" />權限管理</button>
              )}

              <button onClick={handleLogout} className="flex items-center px-5 py-3.5 rounded-xl text-sm font-bold text-slate-400 hover:bg-red-50 hover:text-red-600 transition-all duration-200 mt-2 lg:mt-0"><LogOut size={20} className="mr-3" />登出</button>
            </nav>

            <div className="mt-auto p-6 hidden lg:block">
                <div className="bg-slate-50 rounded-xl p-4 border border-slate-100 text-xs text-slate-400 text-center">
                    Designed for VGV Asia
                </div>
            </div>
          </aside>
          <main className="flex-1 p-4 lg:p-10 overflow-y-auto bg-[#f8fafc]">
               {activeTab === 'dashboard' ? (
                   <Dashboard transactions={transactions} loading={loading} error={error} onRefresh={() => fetchData(user)} user={user} />
               ) : (
                   <AdminPanel users={adminUsers} onSave={saveUserConfig} onRefreshUsers={fetchUsers} loading={loading}/>
               )}
          </main>
        </div>
      </ErrorBoundary>
    </div>
  );
}
