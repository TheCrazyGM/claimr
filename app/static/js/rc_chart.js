// rc_chart.js
// Handles RC Cost Over Time chart with daily / weekly / monthly rolling averages
// Displays average line and min-max "cloud" using ApexCharts

(function () {
    const rangeSelectorEl = document.getElementById("rangeSelector");
    const chartContainer = document.querySelector("#costChart");
    if (!rangeSelectorEl || !chartContainer) return; // nothing to do on pages without chart

    let currentRange = "daily"; // default view
    let rawLabels = [];
    let rawCosts = [];
    let chart = null;

    // ---- helpers ----
    const msPerDay = 86400000;
    function bucketDaily(labels, costs) {
        const tzOffsetMs = new Date().getTimezoneOffset() * 60000; // local offset
        const buckets = new Map();
        labels.forEach((iso, idx) => {
            const t = Date.parse(iso);
            const v = Number(costs[idx]);
            if (isNaN(t) || isNaN(v)) return;
            const dayKey = Math.floor((t - tzOffsetMs) / msPerDay) * msPerDay + tzOffsetMs;
            if (!buckets.has(dayKey)) buckets.set(dayKey, { sum: 0, count: 0, min: v, max: v });
            const b = buckets.get(dayKey);
            b.sum += v;
            b.count += 1;
            if (v < b.min) b.min = v;
            if (v > b.max) b.max = v;
        });
        return Array.from(buckets.entries())
            .sort((a, b) => a[0] - b[0])
            .map(([ts, b]) => ({ ts, avg: b.sum / b.count, min: b.min, max: b.max }));
    }

    function rolling(data, windowDays) {
        if (windowDays <= 1) return data;
        const out = [];
        for (let i = 0; i < data.length; i++) {
            const slice = data.slice(Math.max(0, i - windowDays + 1), i + 1);
            const avg = slice.reduce((s, p) => s + p.avg, 0) / slice.length;
            const min = Math.min(...slice.map((p) => p.min));
            const max = Math.max(...slice.map((p) => p.max));
            out.push({ ts: data[i].ts, avg, min, max });
        }
        return out;
    }

    function prepareSeries() {
        const nowMs = Date.now();
        // DAILY: use raw data from last 24h without extra aggregation
        if (currentRange === "daily") {
            const cutoff = nowMs - msPerDay;
            const pts = rawLabels.reduce((acc, iso, idx) => {
                const t = Date.parse(iso);
                const v = Number(rawCosts[idx]);
                if (isNaN(t) || isNaN(v) || t < cutoff) return acc;
                acc.push({ ts: t, val: v });
                return acc;
            }, []);
            if (pts.length === 0) return { avgSeries: [], bandSeries: [], scale: 1 };
            const maxVal = Math.max(...pts.map((p) => p.val));
            const scale = maxVal > 1e9 ? 1e6 : 1;
            const avgSeries = pts.map((p) => ({ x: p.ts, y: p.val / scale }));
            const bandSeries = pts.map((p) => ({ x: p.ts, y: [p.val / scale, p.val / scale] }));
            return { avgSeries, bandSeries, scale };
        }

        // Helper to bucket into N-hour windows with avg/min/max
        function bucketByHours(labels, costs, hours) {
            const ms = hours * 3600000;
            const buckets = new Map();
            labels.forEach((iso, idx) => {
                const t = Date.parse(iso);
                const v = Number(costs[idx]);
                if (isNaN(t) || isNaN(v)) return;
                const key = Math.floor(t / ms) * ms;
                if (!buckets.has(key)) buckets.set(key, { sum: 0, count: 0, min: v, max: v });
                const b = buckets.get(key);
                b.sum += v;
                b.count += 1;
                if (v < b.min) b.min = v;
                if (v > b.max) b.max = v;
            });
            return Array.from(buckets.entries())
                .sort((a, b) => a[0] - b[0])
                .map(([ts, b]) => ({ ts, avg: b.sum / b.count, min: b.min, max: b.max }));
        }

        // WEEKLY raw points bucketed into 4-hour windows; MONTHLY daily buckets
        if (currentRange === "weekly") {
            const cutoff = nowMs - 7 * 24 * 3600000;
            const bucketList = bucketDaily(rawLabels, rawCosts)
                .filter(p => p.ts >= cutoff && isFinite(p.avg))
                .sort((a, b) => a.ts - b.ts);
            if (bucketList.length === 0) return { avgSeries: [], bandSeries: [], scale: 1 };
            const maxVal = Math.max(...bucketList.map(p => p.max));
            const scale = maxVal > 1e9 ? 1e6 : 1;
            const avgSeries = [];
            const bandSeries = [];
            bucketList.forEach(p => {
                avgSeries.push({ x: p.ts, y: p.avg / scale });
                bandSeries.push({ x: p.ts, y: [p.min / scale, p.max / scale] });
            });
            return { avgSeries, bandSeries, scale };
        }

        // MONTHLY: daily buckets over last 30 days
        const cutoff = nowMs - 30 * 24 * 3600000;
        const bucketList30 = bucketDaily(rawLabels, rawCosts)
            .filter(p => p.ts >= cutoff && isFinite(p.avg))
            .sort((a, b) => a.ts - b.ts);
        if (bucketList30.length === 0) return { avgSeries: [], bandSeries: [], scale: 1 };
        const maxVal = Math.max(...bucketList30.map(p => p.max));
        const scale = maxVal > 1e9 ? 1e6 : 1;
        const avgSeries = [];
        const bandSeries = [];
        bucketList30.forEach(p => {
            avgSeries.push({ x: p.ts, y: p.avg / scale });
            bandSeries.push({ x: p.ts, y: [p.min / scale, p.max / scale] });
        });
        return { avgSeries, bandSeries, scale };
    }

    function drawChart() {
        const { avgSeries, bandSeries, scale } = prepareSeries();
        if (avgSeries.length === 0) {
            chartContainer.innerHTML = "<p class='text-muted'>No RC cost data available.</p>";
            return;
        }
        const options = {
            chart: { type: "line", height: 350, zoom: { enabled: true }, toolbar: { show: true } },
      markers: { size: 4 },
            series: [
                { name: "Average", type: "line", data: avgSeries, color: "#0d6efd" },
                { name: "Range", type: "rangeArea", data: bandSeries, color: "#cfe2ff" },
            ],
            xaxis: { type: "datetime", title: { text: "Time" } },
            yaxis: { title: { text: scale === 1 ? "RC Cost" : "RC Cost (millions)" }, min: 0, labels: { formatter: (v) => (v != null && !isNaN(v) ? v.toLocaleString() : "") } },
            stroke: { curve: "smooth" },
            tooltip: {
                shared: false,
                intersect: true,
                x: { format: "yyyy-MM-dd HH:mm" },
                y: [
                    {
                        formatter: (v) => (v != null && !isNaN(v) ? v.toLocaleString() : "-")
                    }
                ]
            },
        };
        if (chart) {
            chart.updateOptions(options);
        } else {
            // Clean container in case an old chart DOM lingers
            chartContainer.innerHTML = "";
            chart = new ApexCharts(chartContainer, options);
            window.costChartInstance = chart;
            try {
                chart.render();
            } catch (err) {
                console.error("ApexCharts render error", err, { avgLen: avgSeries.length, bandLen: bandSeries.length, sampleBand: bandSeries.slice(0, 5) });
            }
        }
    }

    function fetchData() {
        fetch("/api/rc_cost_data?hours=720")
            .then((r) => r.json())
            .then((d) => {
                rawLabels = d.labels || [];
                rawCosts = Array.isArray(d.costs) ? d.costs.map((c) => Number(c)) : [];
                drawChart();
            })
            .catch((e) => console.error("RC cost data fetch error", e));
    }

    // ---- init ----
    if (rangeSelectorEl) {
        rangeSelectorEl.addEventListener("click", (e) => {
            const btn = e.target.closest("[data-range]");
            if (!btn) return;
            const rng = btn.dataset.range;
            if (rng && rng !== currentRange) {
                currentRange = rng;
                rangeSelectorEl.querySelectorAll("button").forEach((b) => {
                    b.classList.toggle("active", b === btn);
                });
                drawChart();
            }
        });
    }

    fetchData();
})();
