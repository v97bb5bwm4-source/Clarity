import { useEffect, useRef, useState } from "react";
import { useAuth } from "./auth/AuthContext";
import { supabase } from "./lib/supabaseClient";

const expenseCategories = ["Ads", "Shipping", "Software", "Samples", "Packaging", "Returns", "Other"];
const productSelectColumns = "id, name, category, status, selling_price, product_cost, shipping_cost, ad_spend, units_sold";
const productCsvFieldMap = {
  name: ["product name", "product", "name", "product_name", "item", "item name"],
  sellingPrice: ["selling price", "selling_price", "price", "sale price", "retail price"],
  productCost: ["product cost", "product_cost", "cost", "unit cost", "supplier cost"],
  shippingCost: ["shipping cost", "shipping_cost", "shipping", "postage", "delivery cost"],
  adSpend: ["ad spend", "ad_spend", "ads", "advertising", "marketing spend"],
  unitsSold: ["units sold", "units_sold", "units", "quantity", "sold", "orders"],
};
const productCsvFieldLabels = {
  name: "product name",
  sellingPrice: "selling price",
  productCost: "product cost",
  shippingCost: "shipping cost",
  adSpend: "ad spend",
  unitsSold: "units sold",
};

const quickActions = [
  "Import TikTok orders",
  "Add supplier invoice",
  "Sync TikTok ads",
  "Export profit report",
];

const notifications = [
  "18 orders are missing supplier cost",
  "TikTok ads synced 9 minutes ago",
  "Acrylic Beauty Organiser dropped below 0% margin",
];

const storeStats = [
  { label: "Store", value: "GlowHaus UK" },
  { label: "Orders", value: "1,284 synced" },
  { label: "Last sync", value: "9 min ago" },
];

const emptyProductForm = {
  name: "",
  sellingPrice: "",
  productCost: "",
  shippingCost: "",
  adSpend: "",
  unitsSold: "",
};

const emptyExpenseForm = {
  name: "",
  category: "Ads",
  amount: "",
  date: "",
  notes: "",
};

const defaultStoreProfile = {
  storeName: "",
  region: "United Kingdom",
  currency: "GBP",
};

const regionOptions = [
  "United Kingdom",
  "United States",
  "Canada",
  "Australia",
  "European Union",
];

const currencyOptions = [
  { code: "GBP", label: "GBP - British pound", locale: "en-GB" },
  { code: "USD", label: "USD - US dollar", locale: "en-US" },
  { code: "EUR", label: "EUR - Euro", locale: "en-IE" },
  { code: "CAD", label: "CAD - Canadian dollar", locale: "en-CA" },
  { code: "AUD", label: "AUD - Australian dollar", locale: "en-AU" },
];

const navItems = [
  { label: "Dashboard", path: "dashboard", icon: "D" },
  { label: "Products", path: "products", icon: "P" },
  { label: "Loss Analysis", path: "loss-analysis", icon: "L" },
  { label: "Expenses", path: "expenses", icon: "E" },
  { label: "Analytics", path: "analytics", icon: "A" },
  { label: "Settings", path: "settings", icon: "S" },
];

function getInitialPage() {
  const hash = window.location.hash.replace("#", "");
  return navItems.some((item) => item.path === hash) ? hash : "dashboard";
}

function parseMoney(value) {
  return Number(String(value).replace(/[^\d.-]/g, "")) || 0;
}

function parseCsvNumber(value) {
  const cleanedValue = String(value ?? "").replace(/[^\d.-]/g, "");

  if (cleanedValue === "") {
    return null;
  }

  const numberValue = Number(cleanedValue);
  return Number.isNaN(numberValue) ? null : numberValue;
}

function parseCsvLine(line) {
  const values = [];
  let currentValue = "";
  let isInsideQuotes = false;

  for (let index = 0; index < line.length; index += 1) {
    const character = line[index];
    const nextCharacter = line[index + 1];

    if (character === "\"" && nextCharacter === "\"") {
      currentValue += "\"";
      index += 1;
    } else if (character === "\"") {
      isInsideQuotes = !isInsideQuotes;
    } else if (character === "," && !isInsideQuotes) {
      values.push(currentValue.trim());
      currentValue = "";
    } else {
      currentValue += character;
    }
  }

  values.push(currentValue.trim());
  return values;
}

function parseCsv(text) {
  const lines = text
    .replace(/\r/g, "")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);

  if (lines.length < 2) {
    return { headers: [], rows: [] };
  }

  const headers = parseCsvLine(lines[0]);
  const rows = lines.slice(1).map((line) => parseCsvLine(line));

  return { headers, rows };
}

function normalizeCsvHeader(header) {
  return header.toLowerCase().replace(/[_-]/g, " ").replace(/\s+/g, " ").trim();
}

function findCsvColumnIndex(headers, field) {
  const normalizedHeaders = headers.map(normalizeCsvHeader);
  const aliases = productCsvFieldMap[field];

  return normalizedHeaders.findIndex((header) => aliases.includes(header));
}

function mapCsvProducts(headers, rows) {
  const columnIndexes = {
    name: findCsvColumnIndex(headers, "name"),
    sellingPrice: findCsvColumnIndex(headers, "sellingPrice"),
    productCost: findCsvColumnIndex(headers, "productCost"),
    shippingCost: findCsvColumnIndex(headers, "shippingCost"),
    adSpend: findCsvColumnIndex(headers, "adSpend"),
    unitsSold: findCsvColumnIndex(headers, "unitsSold"),
  };
  const missingFields = Object.entries(columnIndexes)
    .filter(([, index]) => index === -1)
    .map(([field]) => productCsvFieldLabels[field]);

  if (missingFields.length > 0) {
    return { products: [], missingFields, skippedRows: rows.length };
  }

  const products = [];
  let skippedRows = 0;

  rows.forEach((row) => {
    const sellingPrice = parseCsvNumber(row[columnIndexes.sellingPrice]);
    const productCost = parseCsvNumber(row[columnIndexes.productCost]);
    const shippingCost = parseCsvNumber(row[columnIndexes.shippingCost]);
    const adSpend = parseCsvNumber(row[columnIndexes.adSpend]);
    const unitsSold = parseCsvNumber(row[columnIndexes.unitsSold]);
    const product = {
      name: row[columnIndexes.name]?.trim() || "",
      category: "CSV import",
      status: "Imported",
      sellingPrice,
      productCost,
      shippingCost,
      adSpend,
      unitsSold: unitsSold === null ? null : Number.parseInt(unitsSold, 10),
    };
    const hasRequiredValues =
      product.name &&
      product.sellingPrice !== null &&
      product.productCost !== null &&
      product.shippingCost !== null &&
      product.adSpend !== null &&
      product.unitsSold !== null &&
      product.sellingPrice >= 0 &&
      product.productCost >= 0 &&
      product.shippingCost >= 0 &&
      product.adSpend >= 0 &&
      product.unitsSold >= 0;

    if (hasRequiredValues) {
      products.push(product);
    } else {
      skippedRows += 1;
    }
  });

  return { products, missingFields, skippedRows };
}

function formatCurrencyValue(value, currency = "GBP") {
  const currencyConfig =
    currencyOptions.find((option) => option.code === currency) ?? currencyOptions[0];

  return new Intl.NumberFormat(currencyConfig.locale, {
    style: "currency",
    currency: currencyConfig.code,
    maximumFractionDigits: value % 1 === 0 ? 0 : 2,
  }).format(value);
}

function toStoreProfile(row) {
  if (!row) {
    return null;
  }

  return {
    storeName: row.store_name,
    region: row.region,
    currency: row.currency,
  };
}

function toProduct(row) {
  return {
    id: row.id,
    name: row.name,
    category: row.category,
    status: row.status,
    sellingPrice: Number(row.selling_price),
    productCost: Number(row.product_cost),
    shippingCost: Number(row.shipping_cost),
    adSpend: Number(row.ad_spend),
    unitsSold: Number(row.units_sold) || 0,
  };
}

function toExpense(row) {
  return {
    id: row.id,
    name: row.name,
    category: row.category,
    amount: Number(row.amount),
    date: row.date_label,
    notes: row.notes || "",
  };
}

function calculateProduct(product) {
  const sellingPrice = parseMoney(product.sellingPrice);
  const productCost = parseMoney(product.productCost);
  const shippingCost = parseMoney(product.shippingCost);
  const adSpend = parseMoney(product.adSpend);
  const unitsSold = Number(product.unitsSold) || 0;
  const costPerUnit = productCost + shippingCost + adSpend;
  const unitProfit = sellingPrice - costPerUnit;
  const revenue = sellingPrice * unitsSold;
  const totalCosts = costPerUnit * unitsSold;
  const trueProfit = unitProfit * unitsSold;
  const margin = revenue > 0 ? Math.round((trueProfit / revenue) * 100) : 0;
  const adSpendRatio = sellingPrice > 0 ? Math.round((adSpend / sellingPrice) * 100) : 0;
  const shippingRatio = sellingPrice > 0 ? Math.round((shippingCost / sellingPrice) * 100) : 0;
  const costRatio = sellingPrice > 0 ? Math.round((costPerUnit / sellingPrice) * 100) : 0;

  return { revenue, trueProfit, margin, unitProfit, totalCosts, costPerUnit, adSpendRatio, shippingRatio, costRatio };
}

function getStoreInitials(storeName) {
  return storeName
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((word) => word[0])
    .join("")
    .toUpperCase() || "S";
}

function App() {
  const { signOut, user } = useAuth();
  const csvFileInputRef = useRef(null);
  const [storeProfile, setStoreProfile] = useState(null);
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const [activePage, setActivePage] = useState(getInitialPage);
  const [selectedRange, setSelectedRange] = useState("This Month");
  const [analyticsRange, setAnalyticsRange] = useState("This Month");
  const [searchTerm, setSearchTerm] = useState("");
  const [productProfitFilter, setProductProfitFilter] = useState("All products");
  const [products, setProducts] = useState([]);
  const [isProductModalOpen, setIsProductModalOpen] = useState(false);
  const [editingProductId, setEditingProductId] = useState(null);
  const [productForm, setProductForm] = useState(emptyProductForm);
  const [productErrors, setProductErrors] = useState({});
  const [isCsvImportOpen, setIsCsvImportOpen] = useState(false);
  const [csvImportRows, setCsvImportRows] = useState([]);
  const [csvImportMessage, setCsvImportMessage] = useState("");
  const [csvImportError, setCsvImportError] = useState("");
  const [csvImportSaving, setCsvImportSaving] = useState(false);
  const [expenseItems, setExpenseItems] = useState([]);
  const [isExpenseModalOpen, setIsExpenseModalOpen] = useState(false);
  const [editingExpenseId, setEditingExpenseId] = useState(null);
  const [expenseForm, setExpenseForm] = useState(emptyExpenseForm);
  const [expenseErrors, setExpenseErrors] = useState({});
  const [settingsForm, setSettingsForm] = useState(defaultStoreProfile);
  const [settingsErrors, setSettingsErrors] = useState({});
  const [settingsMessage, setSettingsMessage] = useState("");
  const [settingsSaving, setSettingsSaving] = useState(false);
  const [dataLoading, setDataLoading] = useState(true);
  const [dataError, setDataError] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [toast, setToast] = useState(null);
  const [deleteConfirmation, setDeleteConfirmation] = useState(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const activeCurrency = storeProfile?.currency ?? defaultStoreProfile.currency;
  const formatCurrency = (value) => formatCurrencyValue(value, activeCurrency);

  const productSummaries = products.map((product) => {
    const totals = calculateProduct(product);

    return {
      ...product,
      revenueValue: totals.revenue,
      trueProfitValue: totals.trueProfit,
      marginValue: totals.margin,
      unitProfitValue: totals.unitProfit,
      totalCostsValue: totals.totalCosts,
      costPerUnitValue: totals.costPerUnit,
      adSpendRatioValue: totals.adSpendRatio,
      shippingRatioValue: totals.shippingRatio,
      costRatioValue: totals.costRatio,
    };
  });

  const totalRevenue = productSummaries.reduce((total, product) => total + product.revenueValue, 0);
  const productTrueProfit = productSummaries.reduce((total, product) => total + product.trueProfitValue, 0);
  const totalUnitsSold = productSummaries.reduce(
    (total, product) => total + (Number(product.unitsSold) || 0),
    0,
  );

  const filteredProductRows = products.filter((product) => {
    const matchesSearch = product.name.toLowerCase().includes(searchTerm.toLowerCase());
    const { trueProfit } = calculateProduct(product);
    const matchesProfitFilter =
      productProfitFilter === "All products" ||
      (productProfitFilter === "Profitable" && trueProfit >= 0) ||
      (productProfitFilter === "Losing money" && trueProfit < 0);

    return matchesSearch && matchesProfitFilter;
  });

  const totalMonthlyExpenses = expenseItems.reduce(
    (total, expense) => total + parseMoney(expense.amount),
    0,
  );
  const totalTrueNetProfit = productTrueProfit - totalMonthlyExpenses;
  const averageProfitMargin =
    totalRevenue > 0 ? Math.round((totalTrueNetProfit / totalRevenue) * 100) : 0;

  const expenseCategoryTotals = expenseCategories.map((category) => ({
    category,
    total: expenseItems
      .filter((expense) => expense.category === category)
      .reduce((sum, expense) => sum + parseMoney(expense.amount), 0),
  }));
  const bestProduct = [...productSummaries].sort((a, b) => b.trueProfitValue - a.trueProfitValue)[0];
  const worstProduct = [...productSummaries].sort((a, b) => a.trueProfitValue - b.trueProfitValue)[0];
  const productsLosingMoney = productSummaries
    .filter((product) => product.trueProfitValue < 0)
    .sort((a, b) => a.trueProfitValue - b.trueProfitValue);
  const lossAnalysisRows = productSummaries.map((product) => {
    const sellingPrice = parseMoney(product.sellingPrice);
    const productCost = parseMoney(product.productCost);
    const shippingCost = parseMoney(product.shippingCost);
    const adSpend = parseMoney(product.adSpend);
    const unitProfit = sellingPrice - productCost - shippingCost - adSpend;
    const adSpendRatio = sellingPrice > 0 ? Math.round((adSpend / sellingPrice) * 100) : 0;
    const shippingRatio = sellingPrice > 0 ? Math.round((shippingCost / sellingPrice) * 100) : 0;
    const isLosingMoney = product.trueProfitValue < 0;
    const hasLowMargin = product.marginValue >= 0 && product.marginValue < 15;
    const hasHighAdSpend = adSpendRatio >= 25;
    const hasShrinkingMarginRisk =
      product.marginValue >= 15 &&
      product.marginValue < 30 &&
      (adSpendRatio >= 18 || shippingRatio >= 18);
    const recommendations = [];

    if (hasHighAdSpend || isLosingMoney) {
      recommendations.push("Reduce ad spend");
    }

    if (hasLowMargin || isLosingMoney) {
      recommendations.push("Raise selling price");
    }

    if (shippingRatio >= 15 || isLosingMoney) {
      recommendations.push("Reduce shipping cost");
    }

    if (isLosingMoney && adSpendRatio >= 20) {
      recommendations.push("Pause ads");
    }

    return {
      ...product,
      unitProfit,
      adSpendRatio,
      shippingRatio,
      isLosingMoney,
      hasLowMargin,
      hasHighAdSpend,
      hasShrinkingMarginRisk,
      warningLevel: isLosingMoney ? "Critical" : hasHighAdSpend || hasLowMargin ? "Warning" : "Watch",
      recommendations: recommendations.length > 0 ? recommendations : ["Monitor before scaling"],
    };
  });
  const lossAnalysisGroups = {
    losingMoney: lossAnalysisRows
      .filter((product) => product.isLosingMoney)
      .sort((a, b) => a.trueProfitValue - b.trueProfitValue),
    shrinkingMargins: lossAnalysisRows
      .filter((product) => product.hasShrinkingMarginRisk)
      .sort((a, b) => a.marginValue - b.marginValue),
    highAdSpend: lossAnalysisRows
      .filter((product) => product.hasHighAdSpend)
      .sort((a, b) => b.adSpendRatio - a.adSpendRatio),
    lowMargins: lossAnalysisRows
      .filter((product) => product.hasLowMargin)
      .sort((a, b) => a.marginValue - b.marginValue),
  };
  const totalLossAnalysisWarnings = new Set(
    Object.values(lossAnalysisGroups).flat().map((product) => product.id),
  ).size;
  const dashboardTopProducts = [...productSummaries]
    .sort((a, b) => b.trueProfitValue - a.trueProfitValue)
    .slice(0, 6);
  const chartProducts = [...productSummaries]
    .sort((a, b) => Math.abs(b.trueProfitValue) - Math.abs(a.trueProfitValue))
    .slice(0, 7);
  const chartMaxProfit = Math.max(
    ...chartProducts.map((product) => Math.abs(product.trueProfitValue)),
    1,
  );
  const productProfitTrend = chartProducts.map((product) => ({
    day: product.name.split(" ").slice(0, 2).join(" "),
    height: Math.max(10, Math.round((Math.abs(product.trueProfitValue) / chartMaxProfit) * 100)),
    profit: formatCurrency(product.trueProfitValue),
    isLoss: product.trueProfitValue < 0,
  }));
  const revenueExpenseMax = Math.max(totalRevenue, totalMonthlyExpenses, 1);
  const revenueExpenseBars = [
    {
      label: "Revenue",
      value: totalRevenue,
      height: Math.max(8, Math.round((totalRevenue / revenueExpenseMax) * 100)),
      tone: "revenue",
    },
    {
      label: "Expenses",
      value: totalMonthlyExpenses,
      height: Math.max(8, Math.round((totalMonthlyExpenses / revenueExpenseMax) * 100)),
      tone: "expense",
    },
    {
      label: "Net profit",
      value: totalTrueNetProfit,
      height: Math.max(8, Math.round((Math.abs(totalTrueNetProfit) / revenueExpenseMax) * 100)),
      tone: totalTrueNetProfit >= 0 ? "profit" : "loss",
    },
  ];
  const totalAdSpend = productSummaries.reduce(
    (total, product) => total + parseMoney(product.adSpend) * (Number(product.unitsSold) || 0),
    0,
  );
  const totalShippingCost = productSummaries.reduce(
    (total, product) => total + parseMoney(product.shippingCost) * (Number(product.unitsSold) || 0),
    0,
  );
  const adSpendShare = totalRevenue > 0 ? Math.round((totalAdSpend / totalRevenue) * 100) : 0;
  const shippingShare = totalRevenue > 0 ? Math.round((totalShippingCost / totalRevenue) * 100) : 0;
  const estimatedPendingPayout = Math.max(0, totalRevenue - totalMonthlyExpenses - totalAdSpend);
  const estimatedNextPayout = estimatedPendingPayout * 0.72;
  const payoutReserve = estimatedPendingPayout - estimatedNextPayout;
  const trendMultipliers = [0.82, 0.95, 1.08, 0.9, 1.18, 0.74, 1.03];
  const trendLabels = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
  const trendEvents = [
    "Baseline orders",
    "Creator post lift",
    "Voucher push",
    "Dispatch delay",
    "Ad scale",
    "Refund drag",
    "Weekend recovery",
  ];
  const revenueTrendPoints = trendMultipliers.map((multiplier, index) => {
    const revenue = Math.round((totalRevenue / 7) * multiplier);
    const adPressure = index === 4 ? 1.42 : index === 5 ? 1.28 : index === 2 ? 1.12 : 0.96;
    const adSpend = Math.round((totalAdSpend / 7) * adPressure);
    const seasonalDrag = index === 5 ? 0.88 : index === 4 ? 0.94 : 1;
    const profit = Math.round((productTrueProfit / 7) * multiplier * seasonalDrag - adSpend * 0.18);

    return {
      label: trendLabels[index],
      event: trendEvents[index],
      revenue,
      profit,
      adSpend,
    };
  });
  const maxTrendRevenue = Math.max(...revenueTrendPoints.map((point) => point.revenue), 1);
  const revenueTrend = revenueTrendPoints.map((point) => ({
    ...point,
    revenueHeight: Math.max(10, Math.round((point.revenue / maxTrendRevenue) * 100)),
    profitHeight: Math.max(8, Math.round((Math.abs(point.profit) / maxTrendRevenue) * 100)),
    isProfitDrop: point.profit < productTrueProfit / 7 * 0.75,
  }));
  const biggestProfitDrop = [...revenueTrend].sort((a, b) => a.profit - b.profit)[0];
  const seasonalSignal =
    totalUnitsSold > 300
      ? "Weekend demand is uneven; keep best sellers stocked before creator posts land."
      : "Sales volume is still thin, so one refund or ad test can distort daily profit.";
  const operationalWarnings = [
    ...(adSpendShare >= 22
      ? [`Ad spend is ${adSpendShare}% of revenue. Check Spark Ads before scaling new creatives.`]
      : [`Ad spend is ${adSpendShare}% of revenue. Keep campaigns capped until conversion data is stable.`]),
    ...(shippingShare >= 16
      ? [`Shipping is ${shippingShare}% of revenue. Review label costs or bundle thresholds.`]
      : [`Shipping is ${shippingShare}% of revenue. Current fulfilment cost looks controlled.`]),
    ...(productsLosingMoney.length > 0
      ? [`${productsLosingMoney.length} product${productsLosingMoney.length === 1 ? "" : "s"} lose money after ads and fulfilment.`]
      : ["No products are currently below zero true profit."]),
  ];
  const sellerInsights = [
    bestProduct
      ? `${bestProduct.name} is carrying profit. Keep stock cover above one payout cycle before increasing ads.`
      : "Add products to identify which SKU is carrying profit.",
    biggestProfitDrop
      ? `${biggestProfitDrop.label} shows the weakest profit pattern after ${biggestProfitDrop.event.toLowerCase()}.`
      : "Import product data to build a daily operating pattern.",
    `Estimated next payout is ${formatCurrency(estimatedNextPayout)}, with ${formatCurrency(payoutReserve)} held back for fees, refunds, and timing differences.`,
  ];
  const rankedProducts = [...productSummaries].sort(
    (a, b) => b.trueProfitValue - a.trueProfitValue,
  );
  const marginHealth = [
    {
      label: "Healthy",
      detail: "30% margin and above",
      count: productSummaries.filter((product) => product.marginValue >= 30).length,
    },
    {
      label: "Watch",
      detail: "1% to 29% margin",
      count: productSummaries.filter((product) => product.marginValue > 0 && product.marginValue < 30).length,
    },
    {
      label: "Losing money",
      detail: "Below 0% margin",
      count: productsLosingMoney.length,
    },
  ];
  const importPreviewSummary = csvImportRows.reduce(
    (summary, product) => {
      const totals = calculateProduct(product);

      return {
        revenue: summary.revenue + totals.revenue,
        profit: summary.profit + totals.trueProfit,
        units: summary.units + (Number(product.unitsSold) || 0),
      };
    },
    { revenue: 0, profit: 0, units: 0 },
  );
  const productsAtRisk = totalLossAnalysisWarnings;
  const dashboardMetrics = [
    {
      label: "Total Revenue",
      value: formatCurrency(totalRevenue),
      change: `${totalUnitsSold} units`,
      tone: "positive",
      detail: "Calculated from product selling price and units sold",
      meta: bestProduct ? `Best seller: ${bestProduct.name}` : "No products yet",
      breakdown: [
        `${products.length} products tracked`,
        `Average order value ${formatCurrency(totalUnitsSold ? totalRevenue / totalUnitsSold : 0)}`,
      ],
    },
    {
      label: "Total Expenses",
      value: formatCurrency(totalMonthlyExpenses),
      change: `${expenseItems.length} entries`,
      tone: "neutral",
      detail: "Tracked from the Expenses page",
      meta: "Saved in Supabase",
      breakdown: expenseCategoryTotals
        .filter((expense) => expense.total > 0)
        .slice(0, 2)
        .map((expense) => `${expense.category}: ${formatCurrency(expense.total)}`),
    },
    {
      label: "True Net Profit",
      value: formatCurrency(totalTrueNetProfit),
      change: `${averageProfitMargin}% margin`,
      tone: "profit",
      detail: "Product profit after tracked expenses",
      meta: worstProduct ? `Worst: ${worstProduct.name}` : "No products yet",
      breakdown: [
        `Product profit ${formatCurrency(productTrueProfit)}`,
        `${productsLosingMoney.length} products losing money`,
      ],
    },
    {
      label: "Avg Profit Margin",
      value: `${averageProfitMargin}%`,
      change: bestProduct ? `${bestProduct.marginValue}% best` : "0%",
      tone: "positive",
      detail: "True net profit divided by total revenue",
      meta: bestProduct ? bestProduct.name : "No products yet",
      breakdown: [
        `Best product ${bestProduct ? bestProduct.name : "None"}`,
        `Worst product ${worstProduct ? worstProduct.name : "None"}`,
      ],
    },
    {
      label: "Units Sold",
      value: String(totalUnitsSold),
      change: `${products.length} SKUs`,
      tone: "neutral",
      detail: "Total units sold from stored product data",
      meta: bestProduct ? `${bestProduct.unitsSold} units top SKU` : "No units yet",
      breakdown: [
        `Revenue per unit ${formatCurrency(totalUnitsSold ? totalRevenue / totalUnitsSold : 0)}`,
        `Expenses per unit ${formatCurrency(totalUnitsSold ? totalMonthlyExpenses / totalUnitsSold : 0)}`,
      ],
    },
  ];
  const analyticsFromData = [
    {
      label: "Average order value",
      value: formatCurrency(totalUnitsSold ? totalRevenue / totalUnitsSold : 0),
      detail: `${totalUnitsSold} units sold across ${products.length} products`,
    },
    {
      label: "Average profit margin",
      value: `${averageProfitMargin}%`,
      detail: "After stored expenses",
    },
    {
      label: "Next payout estimate",
      value: formatCurrency(estimatedNextPayout),
      detail: "Approximate settlement after ads, expenses, and timing reserve",
    },
    {
      label: "Best product",
      value: bestProduct ? bestProduct.name : "No products",
      detail: bestProduct ? `${formatCurrency(bestProduct.trueProfitValue)} true profit` : "Add a product to start",
    },
    {
      label: "Worst product",
      value: worstProduct ? worstProduct.name : "No products",
      detail: worstProduct ? `${formatCurrency(worstProduct.trueProfitValue)} true profit` : "Add a product to start",
    },
  ];
  const recentActivityFromData = [
    {
      title: "Dashboard recalculated",
      detail: `${products.length} products and ${expenseItems.length} expenses included`,
      time: "Now",
    },
    {
      title: "Best performing product",
      detail: bestProduct
        ? `${bestProduct.name} generated ${formatCurrency(bestProduct.trueProfitValue)} true profit`
        : "Add products to find your best performer",
      time: "Live",
    },
    {
      title: "Worst performing product",
      detail: worstProduct
        ? `${worstProduct.name} is at ${formatCurrency(worstProduct.trueProfitValue)} true profit`
        : "No product data yet",
      time: "Live",
    },
    {
      title: "Expense tracker synced",
      detail: `${formatCurrency(totalMonthlyExpenses)} in monthly expenses loaded from Supabase`,
      time: "Live",
    },
  ];

  useEffect(() => {
    const handleHashChange = () => setActivePage(getInitialPage());
    window.addEventListener("hashchange", handleHashChange);
    return () => window.removeEventListener("hashchange", handleHashChange);
  }, []);

  useEffect(() => {
    if (!toast) {
      return undefined;
    }

    const timeoutId = window.setTimeout(() => setToast(null), 3600);
    return () => window.clearTimeout(timeoutId);
  }, [toast]);

  useEffect(() => {
    if (!user?.id || !supabase) {
      return undefined;
    }

    let isMounted = true;

    async function loadWorkspaceData() {
      setDataLoading(true);
      setDataError("");

      const [profileResult, productsResult, expensesResult] = await Promise.all([
        supabase
          .from("store_profiles")
          .select("store_name, region, currency")
          .eq("user_id", user.id)
          .maybeSingle(),
        supabase
          .from("products")
          .select(productSelectColumns)
          .eq("user_id", user.id)
          .order("created_at", { ascending: false }),
        supabase
          .from("expenses")
          .select("id, name, category, amount, date_label, notes")
          .eq("user_id", user.id)
          .order("created_at", { ascending: false }),
      ]);

      if (!isMounted) {
        return;
      }

      const error = profileResult.error || productsResult.error || expensesResult.error;

      if (error) {
        setDataError(error.message);
        setToast({ type: "error", message: error.message });
      } else {
        const nextProfile = toStoreProfile(profileResult.data);
        setStoreProfile(nextProfile);
        if (nextProfile) {
          setSettingsForm(nextProfile);
        }
        setProducts((productsResult.data || []).map(toProduct));
        setExpenseItems((expensesResult.data || []).map(toExpense));
      }

      setDataLoading(false);
    }

    loadWorkspaceData();

    return () => {
      isMounted = false;
    };
  }, [user?.id]);

  const saveStoreProfile = async (profile) => {
    const nextProfile = {
      storeName: profile.storeName.trim(),
      region: profile.region,
      currency: profile.currency,
    };
    const { error } = await supabase.from("store_profiles").upsert({
      user_id: user.id,
      store_name: nextProfile.storeName,
      region: nextProfile.region,
      currency: nextProfile.currency,
    });

    if (error) {
      setDataError(error.message);
      setToast({ type: "error", message: error.message });
      return false;
    }

    setDataError("");
    setStoreProfile(nextProfile);
    setSettingsForm(nextProfile);
    return true;
  };

  const updateSettingsForm = (field, value) => {
    setSettingsForm((current) => ({ ...current, [field]: value }));
    setSettingsErrors((current) => ({ ...current, [field]: "" }));
    setSettingsMessage("");
  };

  const saveSettings = async () => {
    const nextErrors = {};

    if (!settingsForm.storeName.trim()) {
      nextErrors.storeName = "Store name is required.";
    }

    if (!settingsForm.region) {
      nextErrors.region = "Choose your store region.";
    }

    if (!settingsForm.currency) {
      nextErrors.currency = "Choose your dashboard currency.";
    }

    setSettingsErrors(nextErrors);

    if (Object.keys(nextErrors).length > 0) {
      return;
    }

    setSettingsSaving(true);
    const saved = await saveStoreProfile(settingsForm);
    setSettingsSaving(false);

    if (saved) {
      setSettingsMessage("Settings saved.");
      setToast({ type: "success", message: "Settings saved." });
    }
  };

  const showSuccessToast = (message) => {
    setToast({ type: "success", message });
  };

  const showErrorToast = (message) => {
    setToast({ type: "error", message });
  };

  const handleSettingsSubmit = (event) => {
    event.preventDefault();
    saveSettings();
  };

  const handleSync = () => {
    setIsLoading(true);
    window.setTimeout(() => setIsLoading(false), 900);
  };

  const openAddProductModal = () => {
    setEditingProductId(null);
    setProductForm(emptyProductForm);
    setProductErrors({});
    setIsProductModalOpen(true);
  };

  const openEditProductModal = (product) => {
    setEditingProductId(product.id);
    setProductForm({
      name: product.name,
      sellingPrice: String(parseMoney(product.sellingPrice)),
      productCost: String(parseMoney(product.productCost)),
      shippingCost: String(parseMoney(product.shippingCost)),
      adSpend: String(parseMoney(product.adSpend)),
      unitsSold: String(product.unitsSold),
    });
    setProductErrors({});
    setIsProductModalOpen(true);
  };

  const closeProductModal = () => {
    setIsProductModalOpen(false);
    setEditingProductId(null);
    setProductForm(emptyProductForm);
    setProductErrors({});
  };

  const updateProductForm = (field, value) => {
    setProductForm((current) => ({ ...current, [field]: value }));
    setProductErrors((current) => ({ ...current, [field]: "" }));
  };

  const validateProductForm = () => {
    const errors = {};
    const numericFields = ["sellingPrice", "productCost", "shippingCost", "adSpend", "unitsSold"];

    if (!productForm.name.trim()) {
      errors.name = "Product name is required.";
    }

    numericFields.forEach((field) => {
      if (productForm[field] === "") {
        errors[field] = "This field is required.";
      } else if (Number(productForm[field]) < 0 || Number.isNaN(Number(productForm[field]))) {
        errors[field] = "Enter a valid number.";
      }
    });

    return errors;
  };

  const saveProduct = async () => {
    const errors = validateProductForm();
    setProductErrors(errors);

    if (Object.keys(errors).length > 0) {
      return;
    }

    const savedProduct = {
      name: productForm.name.trim(),
      category: "Manual product",
      status: "Manual",
      sellingPrice: formatCurrency(Number(productForm.sellingPrice)),
      productCost: formatCurrency(Number(productForm.productCost)),
      shippingCost: formatCurrency(Number(productForm.shippingCost)),
      adSpend: formatCurrency(Number(productForm.adSpend)),
      unitsSold: Number(productForm.unitsSold),
    };
    const productPayload = {
      user_id: user.id,
      name: savedProduct.name,
      category: savedProduct.category,
      status: savedProduct.status,
      selling_price: Number(productForm.sellingPrice),
      product_cost: Number(productForm.productCost),
      shipping_cost: Number(productForm.shippingCost),
      ad_spend: Number(productForm.adSpend),
      units_sold: Number(productForm.unitsSold),
    };

    if (editingProductId) {
      const { data, error } = await supabase
        .from("products")
        .update(productPayload)
        .eq("id", editingProductId)
        .eq("user_id", user.id)
        .select(productSelectColumns)
        .single();

      if (error) {
        setDataError(error.message);
        showErrorToast(error.message);
        return;
      }

      setProducts((current) =>
        current.map((product) =>
          product.id === editingProductId ? toProduct(data) : product,
        ),
      );
      showSuccessToast("Product updated.");
    } else {
      const { data, error } = await supabase
        .from("products")
        .insert(productPayload)
        .select(productSelectColumns)
        .single();

      if (error) {
        setDataError(error.message);
        showErrorToast(error.message);
        return;
      }

      setProducts((current) => [toProduct(data), ...current]);
      showSuccessToast("Product added.");
    }

    setDataError("");
    closeProductModal();
  };

  const requestDeleteProduct = (product) => {
    setDeleteConfirmation({
      type: "product",
      id: product.id,
      title: "Delete product?",
      message: `${product.name} will be removed from this workspace.`,
    });
  };

  const deleteProduct = async (productId) => {
    const { error } = await supabase
      .from("products")
      .delete()
      .eq("id", productId)
      .eq("user_id", user.id);

    if (error) {
      setDataError(error.message);
      showErrorToast(error.message);
      return false;
    }

    setDataError("");
    setProducts((current) => current.filter((product) => product.id !== productId));
    showSuccessToast("Product deleted.");
    return true;
  };

  const openCsvFilePicker = () => {
    setCsvImportMessage("");
    setCsvImportError("");
    csvFileInputRef.current?.click();
  };

  const handleCsvFileChange = (event) => {
    const file = event.target.files?.[0];

    if (!file) {
      return;
    }

    const reader = new FileReader();

    reader.onload = () => {
      const { headers, rows } = parseCsv(String(reader.result || ""));
      const { products: importedProducts, missingFields, skippedRows } = mapCsvProducts(headers, rows);

      if (missingFields.length > 0) {
        setCsvImportRows([]);
        setCsvImportError(`Missing columns: ${missingFields.join(", ")}.`);
        setCsvImportMessage("Expected: product name, selling price, product cost, shipping cost, ad spend, units sold.");
        setIsCsvImportOpen(true);
        return;
      }

      if (importedProducts.length === 0) {
        setCsvImportRows([]);
        setCsvImportError("No valid product rows found in this CSV.");
        setCsvImportMessage("");
        setIsCsvImportOpen(true);
        return;
      }

      setCsvImportRows(importedProducts);
      setCsvImportError("");
      setCsvImportMessage(
        skippedRows > 0
          ? `${importedProducts.length} rows ready. ${skippedRows} rows skipped.`
          : `${importedProducts.length} rows ready to import.`,
      );
      setIsCsvImportOpen(true);
    };

    reader.onerror = () => {
      setCsvImportRows([]);
      setCsvImportError("Could not read this CSV file.");
      setCsvImportMessage("");
      setIsCsvImportOpen(true);
    };

    reader.readAsText(file);
    event.target.value = "";
  };

  const closeCsvImportModal = () => {
    setIsCsvImportOpen(false);
    setCsvImportRows([]);
    setCsvImportMessage("");
    setCsvImportError("");
    setCsvImportSaving(false);
  };

  const saveCsvImport = async () => {
    if (csvImportRows.length === 0) {
      setCsvImportError("No products to import.");
      return;
    }

    setCsvImportSaving(true);
    setCsvImportError("");

    const productPayloads = csvImportRows.map((product) => ({
      user_id: user.id,
      name: product.name,
      category: product.category,
      status: product.status,
      selling_price: product.sellingPrice,
      product_cost: product.productCost,
      shipping_cost: product.shippingCost,
      ad_spend: product.adSpend,
      units_sold: product.unitsSold,
    }));
    const { data, error } = await supabase
      .from("products")
      .insert(productPayloads)
      .select(productSelectColumns);

    setCsvImportSaving(false);

      if (error) {
        setCsvImportError(error.message);
        showErrorToast(error.message);
        return;
      }

    const savedProducts = (data || []).map(toProduct);
    setProducts((current) => [...savedProducts, ...current]);
    setDataError("");
    setCsvImportRows([]);
    setCsvImportMessage(`${savedProducts.length} products imported successfully.`);
    showSuccessToast(`${savedProducts.length} products imported.`);
  };

  const openAddExpenseModal = () => {
    setEditingExpenseId(null);
    setExpenseForm(emptyExpenseForm);
    setExpenseErrors({});
    setIsExpenseModalOpen(true);
  };

  const openEditExpenseModal = (expense) => {
    setEditingExpenseId(expense.id);
    setExpenseForm({
      name: expense.name,
      category: expense.category,
      amount: String(parseMoney(expense.amount)),
      date: expense.date,
      notes: expense.notes || "",
    });
    setExpenseErrors({});
    setIsExpenseModalOpen(true);
  };

  const closeExpenseModal = () => {
    setIsExpenseModalOpen(false);
    setEditingExpenseId(null);
    setExpenseForm(emptyExpenseForm);
    setExpenseErrors({});
  };

  const updateExpenseForm = (field, value) => {
    setExpenseForm((current) => ({ ...current, [field]: value }));
    setExpenseErrors((current) => ({ ...current, [field]: "" }));
  };

  const validateExpenseForm = () => {
    const errors = {};

    if (!expenseForm.name.trim()) {
      errors.name = "Expense name is required.";
    }

    if (!expenseForm.category) {
      errors.category = "Choose a category.";
    }

    if (expenseForm.amount === "") {
      errors.amount = "Amount is required.";
    } else if (Number(expenseForm.amount) < 0 || Number.isNaN(Number(expenseForm.amount))) {
      errors.amount = "Enter a valid amount.";
    }

    if (!expenseForm.date.trim()) {
      errors.date = "Date is required.";
    }

    return errors;
  };

  const saveExpense = async () => {
    const errors = validateExpenseForm();
    setExpenseErrors(errors);

    if (Object.keys(errors).length > 0) {
      return;
    }

    const savedExpense = {
      name: expenseForm.name.trim(),
      category: expenseForm.category,
      amount: formatCurrency(Number(expenseForm.amount)),
      date: expenseForm.date.trim(),
      notes: expenseForm.notes.trim(),
    };
    const expensePayload = {
      user_id: user.id,
      name: savedExpense.name,
      category: savedExpense.category,
      amount: Number(expenseForm.amount),
      date_label: savedExpense.date,
      notes: savedExpense.notes,
    };

    if (editingExpenseId) {
      const { data, error } = await supabase
        .from("expenses")
        .update(expensePayload)
        .eq("id", editingExpenseId)
        .eq("user_id", user.id)
        .select("id, name, category, amount, date_label, notes")
        .single();

      if (error) {
        setDataError(error.message);
        showErrorToast(error.message);
        return;
      }

      setExpenseItems((current) =>
        current.map((expense) =>
          expense.id === editingExpenseId ? toExpense(data) : expense,
        ),
      );
      showSuccessToast("Expense updated.");
    } else {
      const { data, error } = await supabase
        .from("expenses")
        .insert(expensePayload)
        .select("id, name, category, amount, date_label, notes")
        .single();

      if (error) {
        setDataError(error.message);
        showErrorToast(error.message);
        return;
      }

      setExpenseItems((current) => [toExpense(data), ...current]);
      showSuccessToast("Expense saved.");
    }

    setDataError("");
    closeExpenseModal();
  };

  const requestDeleteExpense = (expense) => {
    setDeleteConfirmation({
      type: "expense",
      id: expense.id,
      title: "Delete expense?",
      message: `${expense.name} will be removed from tracked expenses.`,
    });
  };

  const deleteExpense = async (expenseId) => {
    const { error } = await supabase
      .from("expenses")
      .delete()
      .eq("id", expenseId)
      .eq("user_id", user.id);

    if (error) {
      setDataError(error.message);
      showErrorToast(error.message);
      return false;
    }

    setDataError("");
    setExpenseItems((current) => current.filter((expense) => expense.id !== expenseId));
    showSuccessToast("Expense deleted.");
    return true;
  };

  const closeDeleteConfirmation = () => {
    if (!isDeleting) {
      setDeleteConfirmation(null);
    }
  };

  const confirmDelete = async () => {
    if (!deleteConfirmation) {
      return;
    }

    setIsDeleting(true);
    const deleted =
      deleteConfirmation.type === "product"
        ? await deleteProduct(deleteConfirmation.id)
        : await deleteExpense(deleteConfirmation.id);

    setIsDeleting(false);
    if (deleted) {
      setDeleteConfirmation(null);
    }
  };

  if (dataLoading) {
    return (
      <main className="loading-dashboard" aria-label="Loading workspace">
        <aside className="loading-sidebar">
          <span className="skeleton-line value" />
          <span className="skeleton-line" />
          <span className="skeleton-line medium" />
        </aside>
        <section className="loading-content">
          <div className="loading-header">
            <span className="skeleton-line short" />
            <span className="skeleton-line value" />
          </div>
          <div className="metrics-grid">
            {[1, 2, 3].map((item) => (
              <article className="metric-card skeleton-card" key={item}>
                <div className="skeleton-stack">
                  <span className="skeleton-line short" />
                  <span className="skeleton-line value" />
                  <span className="skeleton-line" />
                  <span className="skeleton-line medium" />
                </div>
              </article>
            ))}
          </div>
          <section className="dashboard-grid">
            <article className="panel skeleton-panel">
              <span className="skeleton-line short" />
              <span className="skeleton-line value" />
              <span className="skeleton-line" />
            </article>
            <article className="panel skeleton-panel">
              <span className="skeleton-line short" />
              <span className="skeleton-line" />
              <span className="skeleton-line medium" />
            </article>
          </section>
        </section>
      </main>
    );
  }

  if (!storeProfile) {
    return <OnboardingFlow onComplete={saveStoreProfile} errorMessage={dataError} />;
  }

  return (
    <main className={`dashboard-shell ${isSidebarCollapsed ? "sidebar-collapsed" : ""}`}>
      <aside className="sidebar" aria-label="Primary navigation">
        <div className="sidebar-header">
          <div className="brand">
            <span className="brand-mark">C</span>
            <div className="brand-copy">
              <strong>Clarity</strong>
              <span>{storeProfile.storeName}</span>
            </div>
          </div>

          <button
            className="sidebar-toggle"
            type="button"
            aria-label={isSidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"}
            aria-expanded={!isSidebarCollapsed}
            onClick={() => setIsSidebarCollapsed((current) => !current)}
          >
            <span aria-hidden="true">{isSidebarCollapsed ? ">" : "<"}</span>
          </button>
        </div>

        <nav className="nav-list">
          {navItems.map((item) => (
            <a
              className={`nav-item ${activePage === item.path ? "active" : ""}`}
              href={`#${item.path}`}
              key={item.label}
              title={isSidebarCollapsed ? item.label : undefined}
            >
              <span className="nav-icon" aria-hidden="true">{item.icon}</span>
              <span className="nav-label">{item.label}</span>
            </a>
          ))}
        </nav>

        <div className="sidebar-panel">
          <div className="store-panel">
            <span className="store-avatar">{getStoreInitials(storeProfile.storeName)}</span>
            <div>
              <strong>{storeProfile.storeName}</strong>
              <span>{storeProfile.currency} · {storeProfile.region}</span>
            </div>
          </div>
          <div className="store-stats">
            {storeStats.slice(1).map((stat) => (
              <p key={stat.label}>
                <span>{stat.label}</span>
                <strong>{stat.label === "Orders" ? `${totalUnitsSold} units` : stat.value}</strong>
              </p>
            ))}
          </div>
          <span>Monthly target</span>
          <strong>68%</strong>
          <div className="progress-track">
            <span />
          </div>
          <button className="logout-button" type="button" onClick={signOut}>
            Log out
          </button>
        </div>
      </aside>

      <section className="dashboard-content">
        {dataError && <p className="auth-message">{dataError}</p>}
        {renderPage()}
      </section>
      <input
        ref={csvFileInputRef}
        className="file-input"
        type="file"
        accept=".csv,text/csv"
        onChange={handleCsvFileChange}
      />
      {isProductModalOpen && renderProductModal()}
      {isCsvImportOpen && renderCsvImportModal()}
      {deleteConfirmation && renderDeleteConfirmationModal()}
      {toast && renderToast()}
    </main>
  );

  function renderPage() {
    if (activePage === "products") {
      return (
        <PageFrame
          eyebrow="Products"
          title="Product profit calculator"
          actions={
            <div className="topbar-actions compact-actions">
              <button className="secondary-action" type="button" onClick={openCsvFilePicker}>
                Upload CSV
              </button>
              <button className="primary-action" type="button" onClick={openAddProductModal}>
                Add product
              </button>
            </div>
          }
        >
          {renderProductProfitPage()}
          <section className="dashboard-grid">
            {renderLossMakers()}
            {renderAiCard()}
          </section>
        </PageFrame>
      );
    }

    if (activePage === "expenses") {
      return (
        <PageFrame
          eyebrow="Expenses"
          title="Track every cost before it hits profit"
          actions={
            <button
              className="primary-action"
              type="button"
              onClick={openAddExpenseModal}
            >
              Add expense
            </button>
          }
        >
          {renderExpensesPage()}
        </PageFrame>
      );
    }

    if (activePage === "loss-analysis") {
      return (
        <PageFrame
          eyebrow="Loss analysis"
          title="Find products quietly leaking profit"
          actions={<span className="panel-stat">{totalLossAnalysisWarnings} warnings</span>}
        >
          {renderLossAnalysisPage()}
        </PageFrame>
      );
    }

    if (activePage === "analytics") {
      return (
        <PageFrame
          eyebrow="Analytics"
          title="Understand what is driving profit"
          actions={<button className="primary-action" type="button">Export report</button>}
        >
          {renderAnalyticsPage()}
        </PageFrame>
      );
    }

    if (activePage === "settings") {
      return (
        <PageFrame
          eyebrow="Settings"
          title="Manage your Clarity workspace"
          actions={
            <button className="primary-action" type="button" onClick={saveSettings} disabled={settingsSaving}>
              {settingsSaving ? "Saving..." : "Save changes"}
            </button>
          }
        >
          {renderSettingsPage()}
        </PageFrame>
      );
    }

    return renderDashboardPage();
  }

  function renderDashboardPage() {
    return (
      <>
        <header className="topbar">
          <div>
            <p className="eyebrow">Dashboard</p>
            <h1>True profit tracking for TikTok Shop sellers</h1>
          </div>
          <div className="topbar-actions">
            <Notifications />
            <button className="secondary-action" type="button" onClick={openAddProductModal}>Add Product</button>
            <button className="secondary-action" type="button" onClick={openCsvFilePicker}>Upload CSV</button>
            <button className="primary-action" type="button" onClick={handleSync}>
              {isLoading ? "Syncing..." : "Sync data"}
            </button>
          </div>
        </header>

        <DateFilters />

        <section className="metrics-grid" aria-label="Financial summary">
          {(isLoading ? dashboardMetrics.map((metric) => ({ ...metric, loading: true })) : dashboardMetrics).map((metric) => (
            <article className={`metric-card ${metric.tone}`} key={metric.label}>
              {metric.loading ? (
                <div className="skeleton-stack" aria-label={`${metric.label} loading`}>
                  <span className="skeleton-line short" />
                  <span className="skeleton-line value" />
                  <span className="skeleton-line" />
                  <span className="skeleton-line medium" />
                </div>
              ) : (
                <>
                  <div className="metric-header">
                    <span>{metric.label}</span>
                    <strong>{metric.change}</strong>
                  </div>
                  <p className="metric-value">{metric.value}</p>
                  <p className="metric-detail">{metric.detail}</p>
                  <div className="metric-breakdown">
                    {metric.breakdown.map((item) => (
                      <span key={item}>{item}</span>
                    ))}
                  </div>
                  <div className="metric-footer">
                    <span>{metric.meta}</span>
                    <span className="mini-chart" aria-hidden="true">
                      <i />
                      <i />
                      <i />
                      <i />
                    </span>
                  </div>
                </>
              )}
            </article>
          ))}
        </section>

        <section className="dashboard-grid">
          {renderTrendPanel()}
          {renderAiCard()}
        </section>

        <section className="dashboard-grid lower-grid">
          {renderProductsPanel()}
          <aside className="side-stack">
            {renderLossMakers()}
            <article className="panel quick-actions">
              <p className="eyebrow">Shortcuts</p>
              <h2>Quick actions</h2>
              <div className="action-grid">
                {quickActions.map((action) => (
                  <button type="button" key={action}>{action}</button>
                ))}
              </div>
            </article>
          </aside>
        </section>

        <section className="activity-section">
          <div className="section-heading">
            <div>
              <p className="eyebrow">Live updates</p>
              <h2>Recent activity</h2>
            </div>
            <a href="#dashboard">View all</a>
          </div>

          <div className="activity-list">
            {recentActivityFromData.map((activity) => (
              <article className="activity-item" key={activity.title}>
                <span className="activity-dot" />
                <div>
                  <h3>{activity.title}</h3>
                  <p>{activity.detail}</p>
                </div>
                <time>{activity.time}</time>
              </article>
            ))}
          </div>
        </section>
      </>
    );
  }

  function renderAnalyticsPage() {
    return (
      <>
        <div className="date-filters analytics-filters" aria-label="Analytics date range filters">
          {["Today", "This Week", "This Month", "All Time"].map((range) => (
            <button
              className={analyticsRange === range ? "active" : ""}
              type="button"
              key={range}
              onClick={() => setAnalyticsRange(range)}
            >
              {range}
            </button>
          ))}
        </div>

        <section className="metrics-grid">
          {analyticsFromData.map((stat) => (
            <article className="simple-stat panel" key={stat.label}>
              <span>{stat.label}</span>
              <strong>{stat.value}</strong>
              <p>{stat.detail}</p>
            </article>
          ))}
        </section>

        <section className="dashboard-grid analytics-grid">
          <article className="panel shop-trend-panel">
            <div className="section-heading">
              <div>
                <p className="eyebrow">TikTok Shop rhythm</p>
                <h2>Revenue trend and ad pressure</h2>
              </div>
              <span className="panel-stat">{adSpendShare}% ad share</span>
            </div>
            <div className="shop-trend-chart" aria-label="Revenue trend over time">
              {revenueTrend.map((point) => (
                <div className="shop-trend-column" key={point.label}>
                  <em>{formatCurrency(point.revenue)}</em>
                  <div className="shop-trend-bars">
                    <span className="revenue" style={{ height: `${point.revenueHeight}%` }} />
                    <span className={point.isProfitDrop ? "profit drop" : "profit"} style={{ height: `${point.profitHeight}%` }} />
                  </div>
                  <small>{point.label}</small>
                </div>
              ))}
            </div>
            <div className="chart-footer">
              <span>
                {biggestProfitDrop
                  ? `${biggestProfitDrop.event} created the sharpest profit dip despite revenue activity.`
                  : "Revenue trend will become clearer as products are added."}
              </span>
              <button type="button">Review ads</button>
            </div>
          </article>

          <article className="panel payout-panel">
            <p className="eyebrow">Settlement planning</p>
            <h2>Payout timing estimate</h2>
            <div className="payout-stack">
              <div>
                <span>Expected next payout</span>
                <strong>{formatCurrency(estimatedNextPayout)}</strong>
                <p>Estimated from current revenue less tracked expenses and ad pressure.</p>
              </div>
              <div>
                <span>Timing reserve</span>
                <strong>{formatCurrency(payoutReserve)}</strong>
                <p>Keep this aside for refunds, fees, delayed settlement, and shipping variance.</p>
              </div>
            </div>
          </article>
        </section>

        <section className="dashboard-grid analytics-grid">
          <article className="panel">
            <div className="section-heading">
              <div>
                <p className="eyebrow">Profit breakdown</p>
                <h2>Where profit is going</h2>
              </div>
              <span className="panel-stat">{analyticsRange}</span>
            </div>
            <div className="profit-breakdown">
              <div>
                <span>Product profit</span>
                <strong>{formatCurrency(productTrueProfit)}</strong>
              </div>
              <div>
                <span>Stored expenses</span>
                <strong>{formatCurrency(totalMonthlyExpenses)}</strong>
              </div>
              <div>
                <span>True net profit</span>
                <strong className={totalTrueNetProfit < 0 ? "negative-profit" : ""}>
                  {formatCurrency(totalTrueNetProfit)}
                </strong>
              </div>
            </div>
          </article>

          <article className="panel revenue-expense-panel">
            <div className="section-heading">
              <div>
                <p className="eyebrow">Cash view</p>
                <h2>Revenue vs expenses</h2>
              </div>
            </div>
            <div className="revenue-expense-chart" aria-label="Revenue versus expenses chart">
              {revenueExpenseBars.map((bar) => (
                <div className="revenue-expense-bar" key={bar.label}>
                  <em>{formatCurrency(bar.value)}</em>
                  <span className={bar.tone} style={{ height: `${bar.height}%` }} />
                  <small>{bar.label}</small>
                </div>
              ))}
            </div>
          </article>
        </section>

        <section className="dashboard-grid lower-grid">
          <article className="panel">
            <div className="section-heading">
              <div>
                <p className="eyebrow">Product ranking</p>
                <h2>Profitability ranking</h2>
              </div>
            </div>
            <div className="analytics-ranking">
              {rankedProducts.length > 0 ? (
                rankedProducts.map((product, index) => (
                  <div className="ranking-row" key={product.id}>
                    <span>{index + 1}</span>
                    <strong>
                      {product.name}
                      <small>{product.unitsSold} units sold</small>
                    </strong>
                    <em className={product.trueProfitValue < 0 ? "negative-profit" : ""}>
                      {formatCurrency(product.trueProfitValue)}
                    </em>
                    <span className={`margin-pill ${product.marginValue < 0 ? "danger" : ""}`}>
                      {product.marginValue}%
                    </span>
                  </div>
                ))
              ) : (
                <div className="empty-state">
                  <strong>No products yet</strong>
                  <p>Add products to build profitability rankings.</p>
                </div>
              )}
            </div>
          </article>

          <aside className="side-stack">
            <article className="panel">
              <p className="eyebrow">Margin health</p>
              <h2>Product health</h2>
              <div className="margin-health-list">
                {marginHealth.map((item) => (
                  <div className="margin-health-item" key={item.label}>
                    <div>
                      <strong>{item.label}</strong>
                      <span>{item.detail}</span>
                    </div>
                    <em>{item.count}</em>
                  </div>
                ))}
              </div>
            </article>

            <article className="panel insight-summary">
              <p className="eyebrow">Best and worst</p>
              <h2>Product insights</h2>
              <div className="insight-pair">
                <span>Best product</span>
                <strong>{bestProduct ? bestProduct.name : "No products"}</strong>
                <p>{bestProduct ? `${formatCurrency(bestProduct.trueProfitValue)} true profit` : "Add a product to start."}</p>
              </div>
              <div className="insight-pair">
                <span>Worst product</span>
                <strong>{worstProduct ? worstProduct.name : "No products"}</strong>
                <p>{worstProduct ? `${formatCurrency(worstProduct.trueProfitValue)} true profit` : "Add a product to start."}</p>
              </div>
            </article>
          </aside>
        </section>

        <section className="dashboard-grid">
          {renderTrendPanel()}
          <article className="panel ai-card">
            <div className="ai-header">
              <p className="eyebrow">Seller operations</p>
              <span>{analyticsRange}</span>
            </div>
            <h2>Operational readout</h2>
            <p>
              {seasonalSignal} Current true net profit is {formatCurrency(totalTrueNetProfit)} after tracked expenses.
            </p>
            <ul className="ai-actions">
              {[...operationalWarnings, ...sellerInsights].slice(0, 5).map((insight) => (
                <li key={insight}>{insight}</li>
              ))}
            </ul>
          </article>
        </section>
      </>
    );
  }

  function renderLossAnalysisPage() {
    const summaryCards = [
      {
        label: "Losing money",
        value: String(lossAnalysisGroups.losingMoney.length),
        detail: "Products where true profit is below zero.",
      },
      {
        label: "Shrinking margin risk",
        value: String(lossAnalysisGroups.shrinkingMargins.length),
        detail: "Products with fragile margins and cost pressure.",
      },
      {
        label: "High ad spend",
        value: String(lossAnalysisGroups.highAdSpend.length),
        detail: "Ad spend is taking a large share of selling price.",
      },
      {
        label: "Low margins",
        value: String(lossAnalysisGroups.lowMargins.length),
        detail: "Products below a 15% profit margin.",
      },
    ];

    return (
      <>
        <section className="metrics-grid loss-summary-grid">
          {summaryCards.map((card) => (
            <article className="simple-stat panel loss-summary-card" key={card.label}>
              <span>{card.label}</span>
              <strong>{card.value}</strong>
              <p>{card.detail}</p>
            </article>
          ))}
        </section>

        <section className="loss-analysis-grid">
          {renderLossAnalysisSection(
            "Products losing money",
            "True profit is below zero after product cost, shipping, and ad spend.",
            lossAnalysisGroups.losingMoney,
            (product) =>
              `${product.name} loses ${formatCurrency(Math.abs(product.trueProfitValue))} across ${product.unitsSold} sold units. Unit profit is ${formatCurrency(product.unitProfit)}.`,
          )}

          {renderLossAnalysisSection(
            "Shrinking margin risk",
            "Margin is still positive, but ads or shipping are putting pressure on it.",
            lossAnalysisGroups.shrinkingMargins,
            (product) =>
              `${product.name} has a ${product.marginValue}% margin, with ads at ${product.adSpendRatio}% and shipping at ${product.shippingRatio}% of selling price.`,
          )}

          {renderLossAnalysisSection(
            "High ad spend",
            "Ad spend is taking a large share of each sale before other costs.",
            lossAnalysisGroups.highAdSpend,
            (product) =>
              `${product.name} spends ${product.adSpendRatio}% of selling price on ads, leaving ${formatCurrency(product.unitProfit)} profit per unit.`,
          )}

          {renderLossAnalysisSection(
            "Low profit margins",
            "These products are not losing money yet, but they have little room for cost increases.",
            lossAnalysisGroups.lowMargins,
            (product) =>
              `${product.name} is at ${product.marginValue}% margin. A small increase in ads, shipping, or supplier cost could erase profit.`,
          )}
        </section>
      </>
    );
  }

  function renderLossAnalysisSection(title, description, rows, explainIssue) {
    return (
      <article className="panel loss-analysis-panel">
        <div className="section-heading">
          <div>
            <p className="eyebrow">Risk check</p>
            <h2>{title}</h2>
          </div>
          <span className={`risk-count ${rows.length > 0 ? "warning" : ""}`}>{rows.length}</span>
        </div>
        <p className="loss-section-copy">{description}</p>

        <div className="loss-analysis-list">
          {rows.length > 0 ? (
            rows.map((product) => (
              <div className="loss-analysis-item" key={`${title}-${product.id}`}>
                <div className="loss-analysis-main">
                  <span className={`warning-dot ${product.warningLevel.toLowerCase()}`} />
                  <div>
                    <strong>{product.name}</strong>
                    <p>{explainIssue(product)}</p>
                  </div>
                </div>

                <div className="loss-analysis-meta">
                  <span className={`risk-pill ${product.warningLevel.toLowerCase()}`}>
                    {product.warningLevel}
                  </span>
                  <span>{product.marginValue}% margin</span>
                  <span>{formatCurrency(product.trueProfitValue)} profit</span>
                </div>

                <div className="recommendation-list" aria-label={`Recommendations for ${product.name}`}>
                  {product.recommendations.slice(0, 3).map((recommendation) => (
                    <em key={recommendation}>{recommendation}</em>
                  ))}
                </div>
              </div>
            ))
          ) : (
            <div className="empty-state compact-empty">
              <strong>No issues found</strong>
              <p>This group is clear based on the products currently saved.</p>
            </div>
          )}
        </div>
      </article>
    );
  }

  function renderTrendPanel() {
    return (
      <article className="panel chart-panel">
        <div className="section-heading">
          <div>
            <p className="eyebrow">Profit movement</p>
            <h2>Daily net profit</h2>
          </div>
          <div className="chart-meta">
            <span className="panel-stat">{formatCurrency(productTrueProfit)}</span>
            <span>{bestProduct ? `Best: ${bestProduct.name}` : "No product data"}</span>
          </div>
        </div>

        <div className={`trend-chart ${isLoading ? "is-loading" : ""}`} aria-label="Profit trend chart placeholder">
          {productProfitTrend.length > 0 ? (
            productProfitTrend.map((point) => (
              <div className="trend-bar" key={point.day}>
                <em>{point.profit}</em>
                <span className={point.isLoss ? "loss-bar" : ""} style={{ height: `${point.height}%` }} />
                <small>{point.day}</small>
              </div>
            ))
          ) : (
            <div className="empty-state chart-empty">
              <strong>No product data</strong>
              <p>Add products to build the profit chart.</p>
            </div>
          )}
        </div>
        <div className="chart-footer">
          <span>Product true profit from stored product data, after product costs, shipping, and ad spend.</span>
          <button type="button">View analytics</button>
        </div>
      </article>
    );
  }

  function renderProductsPanel(fullWidth = false) {
    return (
      <article className={`panel products-panel ${fullWidth ? "full-panel" : ""}`}>
        <div className="section-heading">
          <div>
            <p className="eyebrow">Best performers</p>
            <h2>Top products</h2>
          </div>
          <label className="search-field">
            <span>Search products</span>
            <input
              type="search"
              value={searchTerm}
              onChange={(event) => setSearchTerm(event.target.value)}
              placeholder="Search products"
            />
          </label>
        </div>

        <div className="product-table" role="table" aria-label="Top products">
          <div className="table-row table-head" role="row">
            <span role="columnheader">Product</span>
            <span role="columnheader">Revenue</span>
            <span role="columnheader">Profit</span>
            <span role="columnheader">Margin</span>
          </div>
          {isLoading ? (
            [1, 2, 3].map((row) => (
              <div className="table-row skeleton-row" role="row" key={row}>
                <span className="skeleton-line" />
                <span className="skeleton-line" />
                <span className="skeleton-line" />
                <span className="skeleton-line" />
              </div>
            ))
          ) : dashboardTopProducts.length > 0 ? (
            dashboardTopProducts.map((product) => (
              <div className="table-row" role="row" key={product.id}>
                <strong role="cell">
                  {product.name}
                  <span>{product.unitsSold} units · {formatCurrency(product.unitProfitValue)} / unit</span>
                </strong>
                <span role="cell">{formatCurrency(product.revenueValue)}</span>
                <span role="cell">{formatCurrency(product.trueProfitValue)}</span>
                <span role="cell">{product.marginValue}%</span>
              </div>
            ))
          ) : (
            <div className="empty-state">
              <strong>No products found</strong>
              <p>Try a different search or clear the product filter.</p>
            </div>
          )}
        </div>
      </article>
    );
  }

  function renderProductProfitPage() {
    return (
      <article className="panel products-panel full-panel">
        <div className="section-heading product-page-heading">
          <div>
            <p className="eyebrow">Unit economics</p>
            <h2>Products</h2>
          </div>
          <div className="product-controls">
            <label className="search-field">
              <span>Search products</span>
              <input
                type="search"
                value={searchTerm}
                onChange={(event) => setSearchTerm(event.target.value)}
                placeholder="Search by product name"
              />
            </label>
            <div className="product-filter-buttons" aria-label="Product profit filters">
              {["All products", "Profitable", "Losing money"].map((filter) => (
                <button
                  className={productProfitFilter === filter ? "active" : ""}
                  type="button"
                  key={filter}
                  onClick={() => setProductProfitFilter(filter)}
                >
                  {filter}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="product-profit-table" role="table" aria-label="Product profitability">
          <div className="product-profit-row product-profit-head" role="row">
            <span role="columnheader">Product name</span>
            <span role="columnheader">Selling price</span>
            <span role="columnheader">Product cost</span>
            <span role="columnheader">Shipping cost</span>
            <span role="columnheader">Ad spend</span>
            <span role="columnheader">Units sold</span>
            <span role="columnheader">Revenue</span>
            <span role="columnheader">True profit</span>
            <span role="columnheader">Profit margin</span>
            <span role="columnheader">Cost pressure</span>
            <span role="columnheader">Actions</span>
          </div>

          {filteredProductRows.length > 0 ? (
            filteredProductRows.map((product) => {
              const { revenue, trueProfit, margin, unitProfit, adSpendRatio, shippingRatio } = calculateProduct(product);

              return (
                <div className="product-profit-row" role="row" key={product.id}>
                  <strong role="cell">
                    {product.name}
                    <span>{product.category} · {formatCurrency(unitProfit)} / unit</span>
                  </strong>
                  <span role="cell">{formatCurrency(parseMoney(product.sellingPrice))}</span>
                  <span role="cell">{formatCurrency(parseMoney(product.productCost))}</span>
                  <span role="cell">{formatCurrency(parseMoney(product.shippingCost))}</span>
                  <span role="cell">{formatCurrency(parseMoney(product.adSpend))}</span>
                  <span role="cell">{product.unitsSold}</span>
                  <span role="cell">{formatCurrency(revenue)}</span>
                  <em className={trueProfit < 0 ? "negative-profit" : ""} role="cell">
                    {formatCurrency(trueProfit)}
                  </em>
                  <span className={`margin-pill ${margin < 0 ? "danger" : ""}`} role="cell">
                    {margin}%
                  </span>
                  <span className="row-detail" role="cell">
                    Ads {adSpendRatio}% · Ship {shippingRatio}%
                  </span>
                  <div className="table-actions" role="cell">
                    <button type="button" onClick={() => openEditProductModal(product)}>Edit</button>
                    <button type="button" onClick={() => requestDeleteProduct(product)}>Delete</button>
                  </div>
                </div>
              );
            })
          ) : (
            <div className="empty-state">
              <strong>No matching products</strong>
              <p>Clear the search or change the filters to see more products.</p>
            </div>
          )}
        </div>
      </article>
    );
  }

  function renderProductModal() {
    const preview = calculateProduct(productForm);
    const isEditing = Boolean(editingProductId);

    return (
      <div className="modal-backdrop" role="presentation">
        <section className="modal-card product-modal" role="dialog" aria-modal="true" aria-labelledby="product-modal-title">
          <div className="modal-header">
            <div>
              <p className="eyebrow">{isEditing ? "Edit item" : "New item"}</p>
              <h2 id="product-modal-title">{isEditing ? "Edit product" : "Add product"}</h2>
            </div>
            <button className="icon-button" type="button" onClick={closeProductModal}>x</button>
          </div>

          <form className="expense-form product-form">
            <label>
              <span>Product name</span>
              <input
                type="text"
                value={productForm.name}
                onChange={(event) => updateProductForm("name", event.target.value)}
                placeholder="e.g. Heatless Curling Rod Set"
              />
              {productErrors.name && <em>{productErrors.name}</em>}
              <small className="form-helper">Costs and ad spend are treated per unit. Revenue and profit multiply by units sold.</small>
            </label>

            <div className="form-grid">
              <label>
                <span>Selling price</span>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={productForm.sellingPrice}
                  onChange={(event) => updateProductForm("sellingPrice", event.target.value)}
                  placeholder="18.99"
                />
                {productErrors.sellingPrice && <em>{productErrors.sellingPrice}</em>}
              </label>
              <label>
                <span>Product cost</span>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={productForm.productCost}
                  onChange={(event) => updateProductForm("productCost", event.target.value)}
                  placeholder="5.40"
                />
                {productErrors.productCost && <em>{productErrors.productCost}</em>}
              </label>
              <label>
                <span>Shipping cost</span>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={productForm.shippingCost}
                  onChange={(event) => updateProductForm("shippingCost", event.target.value)}
                  placeholder="2.85"
                />
                {productErrors.shippingCost && <em>{productErrors.shippingCost}</em>}
              </label>
              <label>
                <span>Ad spend</span>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={productForm.adSpend}
                  onChange={(event) => updateProductForm("adSpend", event.target.value)}
                  placeholder="3.10"
                />
                {productErrors.adSpend && <em>{productErrors.adSpend}</em>}
              </label>
              <label>
                <span>Units sold</span>
                <input
                  type="number"
                  min="0"
                  step="1"
                  value={productForm.unitsSold}
                  onChange={(event) => updateProductForm("unitsSold", event.target.value)}
                  placeholder="120"
                />
                {productErrors.unitsSold && <em>{productErrors.unitsSold}</em>}
              </label>
            </div>

            <div className="calculation-preview">
              <div>
                <span>Revenue</span>
                <strong>{formatCurrency(preview.revenue)}</strong>
              </div>
              <div>
                <span>Unit profit</span>
                <strong className={preview.unitProfit < 0 ? "negative-profit" : ""}>
                  {formatCurrency(preview.unitProfit)}
                </strong>
              </div>
              <div>
                <span>True profit</span>
                <strong className={preview.trueProfit < 0 ? "negative-profit" : ""}>
                  {formatCurrency(preview.trueProfit)}
                </strong>
              </div>
              <div>
                <span>Profit margin</span>
                <strong className={preview.margin < 0 ? "negative-profit" : ""}>{preview.margin}%</strong>
              </div>
            </div>

            <div className="modal-actions">
              <button type="button" onClick={closeProductModal}>Cancel</button>
              <button className="primary-action" type="button" onClick={saveProduct}>
                {isEditing ? "Save changes" : "Add product"}
              </button>
            </div>
          </form>
        </section>
      </div>
    );
  }

  function renderCsvImportModal() {
    const previewRows = csvImportRows.slice(0, 8);

    return (
      <div className="modal-backdrop" role="presentation">
        <section className="modal-card csv-modal" role="dialog" aria-modal="true" aria-labelledby="csv-modal-title">
          <div className="modal-header">
            <div>
              <p className="eyebrow">CSV import</p>
              <h2 id="csv-modal-title">Preview products</h2>
            </div>
            <button className="icon-button" type="button" onClick={closeCsvImportModal}>x</button>
          </div>

          <div className="csv-import-body">
            {csvImportError && <p className="auth-message csv-error">{csvImportError}</p>}
            {csvImportMessage && <p className="auth-message">{csvImportMessage}</p>}

            {csvImportRows.length > 0 && (
              <>
                <div className="csv-summary-grid" aria-label="CSV import summary">
                  <div>
                    <span>Rows ready</span>
                    <strong>{csvImportRows.length}</strong>
                  </div>
                  <div>
                    <span>Units</span>
                    <strong>{importPreviewSummary.units}</strong>
                  </div>
                  <div>
                    <span>Est. revenue</span>
                    <strong>{formatCurrency(importPreviewSummary.revenue)}</strong>
                  </div>
                  <div>
                    <span>Est. profit</span>
                    <strong className={importPreviewSummary.profit < 0 ? "negative-profit" : ""}>
                      {formatCurrency(importPreviewSummary.profit)}
                    </strong>
                  </div>
                </div>
                <div className="csv-preview-table" role="table" aria-label="CSV product preview">
                  <div className="csv-preview-row csv-preview-head" role="row">
                    <span role="columnheader">Product</span>
                    <span role="columnheader">Sell</span>
                    <span role="columnheader">Cost</span>
                    <span role="columnheader">Ship</span>
                    <span role="columnheader">Ads</span>
                    <span role="columnheader">Units</span>
                  </div>

                  {previewRows.map((product, index) => (
                    <div className="csv-preview-row" role="row" key={`${product.name}-${index}`}>
                      <strong role="cell">{product.name}</strong>
                      <span role="cell">{formatCurrency(product.sellingPrice)}</span>
                      <span role="cell">{formatCurrency(product.productCost)}</span>
                      <span role="cell">{formatCurrency(product.shippingCost)}</span>
                      <span role="cell">{formatCurrency(product.adSpend)}</span>
                      <span role="cell">{product.unitsSold}</span>
                    </div>
                  ))}
                </div>

                {csvImportRows.length > previewRows.length && (
                  <p className="csv-preview-note">
                    Showing first {previewRows.length} of {csvImportRows.length} rows.
                  </p>
                )}
                <p className="csv-preview-note">
                  Expected columns: product name, selling price, product cost, shipping cost, ad spend, units sold.
                </p>
              </>
            )}

            <div className="modal-actions">
              <button type="button" onClick={closeCsvImportModal}>Cancel</button>
              <button
                className="primary-action"
                type="button"
                onClick={saveCsvImport}
                disabled={csvImportSaving || csvImportRows.length === 0}
              >
                {csvImportSaving ? "Saving..." : "Save imported products"}
              </button>
            </div>
          </div>
        </section>
      </div>
    );
  }

  function renderDeleteConfirmationModal() {
    return (
      <div className="modal-backdrop" role="presentation">
        <section className="modal-card confirm-modal" role="dialog" aria-modal="true" aria-labelledby="confirm-modal-title">
          <div className="modal-header">
            <div>
              <p className="eyebrow">Confirm action</p>
              <h2 id="confirm-modal-title">{deleteConfirmation.title}</h2>
            </div>
            <button className="icon-button" type="button" onClick={closeDeleteConfirmation}>x</button>
          </div>

          <div className="confirm-body">
            <p>{deleteConfirmation.message}</p>
            <p>This cannot be undone.</p>
            <div className="modal-actions">
              <button type="button" onClick={closeDeleteConfirmation}>Cancel</button>
              <button className="danger-action" type="button" onClick={confirmDelete} disabled={isDeleting}>
                {isDeleting ? "Deleting..." : "Delete"}
              </button>
            </div>
          </div>
        </section>
      </div>
    );
  }

  function renderToast() {
    return (
      <div className={`toast ${toast.type}`} role="status" aria-live="polite">
        <strong>{toast.type === "success" ? "Saved" : "Needs attention"}</strong>
        <span>{toast.message}</span>
        <button type="button" onClick={() => setToast(null)} aria-label="Dismiss notification">x</button>
      </div>
    );
  }

  function renderExpensesPage() {
    return (
      <>
        <section className="expense-summary-grid">
          <article className="panel expense-total-card">
            <span>Total expenses</span>
            <strong>{formatCurrency(totalMonthlyExpenses)}</strong>
            <p>Monthly operating costs tracked for this workspace.</p>
          </article>
          {expenseCategoryTotals.map((expense) => (
            <article className="panel expense-category-card" key={expense.category}>
              <span>{expense.category}</span>
              <strong>{formatCurrency(expense.total)}</strong>
              <p>{expense.total > 0 ? "Tracked this month" : "No expenses yet"}</p>
            </article>
          ))}
        </section>

        <section className="dashboard-grid lower-grid">
          <article className="panel expenses-panel">
            <div className="section-heading">
              <div>
                <p className="eyebrow">Expense list</p>
                <h2>Recent expenses</h2>
              </div>
              <span className="panel-stat">{expenseItems.length} entries</span>
            </div>

            <div className="expense-table" role="table" aria-label="Expense list">
              <div className="expense-row expense-head" role="row">
                <span role="columnheader">Expense</span>
                <span role="columnheader">Category</span>
                <span role="columnheader">Date</span>
                <span role="columnheader">Notes</span>
                <span role="columnheader">Amount</span>
                <span role="columnheader">Actions</span>
              </div>
              {expenseItems.length > 0 ? (
                expenseItems.map((expense) => (
                  <div className="expense-row" role="row" key={expense.id}>
                    <strong role="cell">{expense.name}</strong>
                    <span role="cell">{expense.category}</span>
                    <span role="cell">{expense.date}</span>
                    <span role="cell">{expense.notes || "No notes"}</span>
                    <em role="cell">{formatCurrency(parseMoney(expense.amount))}</em>
                    <div className="table-actions" role="cell">
                      <button type="button" onClick={() => openEditExpenseModal(expense)}>Edit</button>
                      <button type="button" onClick={() => requestDeleteExpense(expense)}>Delete</button>
                    </div>
                  </div>
                ))
              ) : (
                <div className="empty-state">
                  <strong>No expenses yet</strong>
                  <p>Add your first expense to start tracking monthly costs.</p>
                </div>
              )}
            </div>
          </article>

          <aside className="side-stack">
            <article className="panel">
              <p className="eyebrow">Categories</p>
              <h2>Cost groups</h2>
              <div className="expense-list">
                {expenseCategoryTotals.map((expense) => (
                  <div className="expense-item" key={expense.category}>
                    <div>
                      <strong>{expense.category}</strong>
                      <span>{expense.total > 0 ? "Active category" : "No costs added"}</span>
                    </div>
                    <em>{formatCurrency(expense.total)}</em>
                  </div>
                ))}
              </div>
            </article>
          </aside>
        </section>

        {isExpenseModalOpen && (
          <div className="modal-backdrop" role="presentation">
            <section className="modal-card" role="dialog" aria-modal="true" aria-labelledby="expense-modal-title">
              <div className="modal-header">
                <div>
                  <p className="eyebrow">{editingExpenseId ? "Edit cost" : "New cost"}</p>
                  <h2 id="expense-modal-title">{editingExpenseId ? "Edit expense" : "Add expense"}</h2>
                </div>
                <button className="icon-button" type="button" onClick={closeExpenseModal}>
                  x
                </button>
              </div>

              <form className="expense-form">
                <label>
                  <span>Expense name</span>
                  <input
                    type="text"
                    value={expenseForm.name}
                    onChange={(event) => updateExpenseForm("name", event.target.value)}
                    placeholder="e.g. TikTok Spark Ads campaign"
                  />
                  {expenseErrors.name && <em>{expenseErrors.name}</em>}
                </label>
                <label>
                  <span>Category</span>
                  <select
                    value={expenseForm.category}
                    onChange={(event) => updateExpenseForm("category", event.target.value)}
                  >
                    {expenseCategories.map((category) => (
                      <option key={category}>{category}</option>
                    ))}
                  </select>
                  {expenseErrors.category && <em>{expenseErrors.category}</em>}
                </label>
                <label>
                  <span>Amount</span>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={expenseForm.amount}
                    onChange={(event) => updateExpenseForm("amount", event.target.value)}
                    placeholder="0.00"
                  />
                  {expenseErrors.amount && <em>{expenseErrors.amount}</em>}
                </label>
                <label>
                  <span>Date</span>
                  <input
                    type="text"
                    value={expenseForm.date}
                    onChange={(event) => updateExpenseForm("date", event.target.value)}
                    placeholder="May 12"
                  />
                  {expenseErrors.date && <em>{expenseErrors.date}</em>}
                </label>
                <label>
                  <span>Notes</span>
                  <input
                    type="text"
                    value={expenseForm.notes}
                    onChange={(event) => updateExpenseForm("notes", event.target.value)}
                    placeholder="Optional context"
                  />
                </label>
                <div className="modal-actions">
                  <button type="button" onClick={closeExpenseModal}>Cancel</button>
                  <button className="primary-action" type="button" onClick={saveExpense}>
                    {editingExpenseId ? "Save changes" : "Save expense"}
                  </button>
                </div>
              </form>
            </section>
          </div>
        )}
      </>
    );
  }

  function renderSettingsPage() {
    return (
      <section className="settings-layout">
        <article className="panel settings-panel">
          <div className="section-heading">
            <div>
              <p className="eyebrow">Store profile</p>
              <h2>Workspace details</h2>
            </div>
          </div>

          {settingsMessage && <p className="auth-message">{settingsMessage}</p>}

          <form className="expense-form settings-form" onSubmit={handleSettingsSubmit}>
            <label>
              <span>Store name</span>
              <input
                type="text"
                value={settingsForm.storeName}
                onChange={(event) => updateSettingsForm("storeName", event.target.value)}
                placeholder="e.g. GlowHaus UK"
              />
              {settingsErrors.storeName && <em>{settingsErrors.storeName}</em>}
            </label>

            <div className="form-grid">
              <label>
                <span>Region</span>
                <select
                  value={settingsForm.region}
                  onChange={(event) => updateSettingsForm("region", event.target.value)}
                >
                  {regionOptions.map((region) => (
                    <option key={region}>{region}</option>
                  ))}
                </select>
                {settingsErrors.region && <em>{settingsErrors.region}</em>}
              </label>

              <label>
                <span>Currency</span>
                <select
                  value={settingsForm.currency}
                  onChange={(event) => updateSettingsForm("currency", event.target.value)}
                >
                  {currencyOptions.map((currency) => (
                    <option value={currency.code} key={currency.code}>
                      {currency.label}
                    </option>
                  ))}
                </select>
                {settingsErrors.currency && <em>{settingsErrors.currency}</em>}
              </label>
            </div>

            <div className="modal-actions">
              <button className="primary-action" type="submit" disabled={settingsSaving}>
                {settingsSaving ? "Saving..." : "Save changes"}
              </button>
            </div>
          </form>
        </article>

        <aside className="panel account-panel">
          <p className="eyebrow">Account</p>
          <h2>Signed in user</h2>
          <div className="account-summary">
            <span>Email</span>
            <strong>{user?.email ?? "No email available"}</strong>
          </div>
          <div className="settings-health-grid" aria-label="Workspace data status">
            <div>
              <span>Products</span>
              <strong>{products.length}</strong>
            </div>
            <div>
              <span>Expenses</span>
              <strong>{expenseItems.length}</strong>
            </div>
            <div>
              <span>Currency</span>
              <strong>{activeCurrency}</strong>
            </div>
            <div>
              <span>Risk flags</span>
              <strong>{productsAtRisk}</strong>
            </div>
          </div>
          <button className="logout-button settings-logout" type="button" onClick={signOut}>
            Log out
          </button>
        </aside>
      </section>
    );
  }

  function renderLossMakers() {
    return (
      <article className="panel loss-panel">
        <p className="eyebrow">Needs attention</p>
        <h2>Products Losing Money</h2>
        <div className="loss-list">
          {productsLosingMoney.length > 0 ? (
            productsLosingMoney.map((product) => (
              <div className="loss-item" key={product.id}>
                <div>
                  <strong>{product.name}</strong>
                  <span>{product.marginValue}% margin from stored product data</span>
                </div>
                <div className="loss-action">
                  <em>{formatCurrency(product.trueProfitValue)}</em>
                  <button type="button">Review costs</button>
                </div>
              </div>
            ))
          ) : (
            <div className="empty-state">
              <strong>No products losing money</strong>
              <p>Every stored product is currently profitable.</p>
            </div>
          )}
        </div>
      </article>
    );
  }

  function renderAiCard() {
    return (
      <article className="panel ai-card">
        <div className="ai-header">
          <p className="eyebrow">AI insight</p>
          <span>Priority</span>
        </div>
        <h2>Protect margin before scaling ads</h2>
        <p>
          True net profit is {formatCurrency(totalTrueNetProfit)} after {formatCurrency(totalMonthlyExpenses)} in tracked expenses.
          Ads are {adSpendShare}% of revenue and shipping is {shippingShare}%.
        </p>
        <ul className="ai-actions">
          <li>{bestProduct ? `${bestProduct.name} is strongest at ${formatCurrency(bestProduct.trueProfitValue)} true profit and ${bestProduct.marginValue}% margin.` : "Add products to find the SKU carrying profit."}</li>
          <li>{worstProduct ? `${worstProduct.name} needs review: ${formatCurrency(worstProduct.unitProfitValue)} unit profit, ${worstProduct.adSpendRatioValue}% ad share.` : "No weak product signal yet."}</li>
          <li>{productsLosingMoney.length > 0 ? `Review ${productsLosingMoney.length} losing product${productsLosingMoney.length === 1 ? "" : "s"} before increasing spend.` : "No stored products are currently below zero true profit."}</li>
          <li>Estimated next payout: {formatCurrency(estimatedNextPayout)} after reserve for fees, refunds, and timing differences.</li>
        </ul>
      </article>
    );
  }

  function DateFilters() {
    return (
      <div className="date-filters" aria-label="Date range filters">
        {["Today", "This Week", "This Month"].map((range) => (
          <button
            className={selectedRange === range ? "active" : ""}
            type="button"
            key={range}
            onClick={() => setSelectedRange(range)}
          >
            {range}
          </button>
        ))}
      </div>
    );
  }
}

function PageFrame({ eyebrow, title, actions, children }) {
  return (
    <>
      <header className="topbar page-topbar">
        <div>
          <p className="eyebrow">{eyebrow}</p>
          <h1>{title}</h1>
        </div>
        {actions}
      </header>
      {children}
    </>
  );
}

function Notifications() {
  return (
    <div className="notifications-panel" aria-label="Notifications">
      <strong>Notifications</strong>
      {notifications.map((notification) => (
        <span key={notification}>{notification}</span>
      ))}
    </div>
  );
}

function OnboardingFlow({ onComplete, errorMessage }) {
  const [form, setForm] = useState(defaultStoreProfile);
  const [errors, setErrors] = useState({});

  const updateForm = (field, value) => {
    setForm((current) => ({ ...current, [field]: value }));
    setErrors((current) => ({ ...current, [field]: "" }));
  };

  const handleSubmit = (event) => {
    event.preventDefault();

    const nextErrors = {};

    if (!form.storeName.trim()) {
      nextErrors.storeName = "Store name is required.";
    }

    if (!form.region) {
      nextErrors.region = "Choose your store region.";
    }

    if (!form.currency) {
      nextErrors.currency = "Choose your dashboard currency.";
    }

    setErrors(nextErrors);

    if (Object.keys(nextErrors).length > 0) {
      return;
    }

    onComplete(form);
  };

  return (
    <main className="auth-shell onboarding-shell">
      <section className="auth-card onboarding-card">
        <div className="auth-brand">
          <span className="brand-mark">C</span>
          <div>
            <strong>Clarity</strong>
            <span>Set up your workspace</span>
          </div>
        </div>

        <div>
          <p className="eyebrow">Onboarding</p>
          <h1>Tell us about your store</h1>
          <p className="auth-copy">
            These details personalize your dashboard and are saved to your workspace.
          </p>
        </div>

        {errorMessage && <p className="auth-message">{errorMessage}</p>}

        <form className="auth-form onboarding-form" onSubmit={handleSubmit}>
          <label>
            <span>Store name</span>
            <input
              type="text"
              value={form.storeName}
              onChange={(event) => updateForm("storeName", event.target.value)}
              placeholder="e.g. GlowHaus UK"
              autoFocus
            />
            {errors.storeName && <em>{errors.storeName}</em>}
          </label>

          <label>
            <span>Region</span>
            <select
              value={form.region}
              onChange={(event) => updateForm("region", event.target.value)}
            >
              {regionOptions.map((region) => (
                <option key={region}>{region}</option>
              ))}
            </select>
            {errors.region && <em>{errors.region}</em>}
          </label>

          <label>
            <span>Currency</span>
            <select
              value={form.currency}
              onChange={(event) => updateForm("currency", event.target.value)}
            >
              {currencyOptions.map((currency) => (
                <option value={currency.code} key={currency.code}>
                  {currency.label}
                </option>
              ))}
            </select>
            {errors.currency && <em>{errors.currency}</em>}
          </label>

          <button className="primary-action" type="submit">
            Continue to dashboard
          </button>
        </form>
      </section>
    </main>
  );
}

export default App;
