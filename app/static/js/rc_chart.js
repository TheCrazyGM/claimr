// rc_chart.js
// Handles RC Cost Over Time chart with sleek Chart.js visualization

(function () {
    // DOM elements
    const rangeSelectorEl = document.getElementById("rangeSelector");
    const chartCanvas = document.querySelector("#costChart");
    if (!rangeSelectorEl || !chartCanvas) return;

    // Create a canvas element inside the container if it's a div
    let canvas;
    if (chartCanvas.tagName === 'DIV') {
        canvas = document.createElement('canvas');
        chartCanvas.innerHTML = '';
        chartCanvas.appendChild(canvas);
        // Important for Chart.js responsiveness
        chartCanvas.style.position = 'relative';
        chartCanvas.style.height = '350px';
    } else {
        canvas = chartCanvas;
    }

    // Chart state
    let currentRange = "daily"; // default view
    let rawLabels = [];
    let rawCosts = [];
    let chartInstance = null;
    const msPerDay = 86400000;

    /**
     * Group data points by day
     */
    function bucketByDay(labels, costs) {
        const buckets = new Map();

        labels.forEach((iso, idx) => {
            const timestamp = Date.parse(iso);
            const value = Number(costs[idx]);

            if (isNaN(timestamp) || isNaN(value)) return;

            // Local midnight key
            const date = new Date(timestamp);
            date.setHours(0, 0, 0, 0);
            const dayKey = date.getTime();

            if (!buckets.has(dayKey)) {
                buckets.set(dayKey, { sum: 0, count: 0, min: value, max: value });
            }

            const bucket = buckets.get(dayKey);
            bucket.sum += value;
            bucket.count += 1;
            bucket.min = Math.min(bucket.min, value);
            bucket.max = Math.max(bucket.max, value);
        });

        return Array.from(buckets.entries())
            .sort((a, b) => a[0] - b[0])
            .map(([ts, b]) => ({
                ts,
                avg: b.sum / b.count,
                min: b.min,
                max: b.max
            }));
    }

    /**
     * Prepare data for Chart.js
     */
    function prepareData() {
        const now = Date.now();
        let scale = 1;
        let unit = "";

        let processedData = [];
        let showBand = false;

        // Process data based on range
        if (currentRange === "daily") {
            const cutoff = now - msPerDay;
            const points = [];

            rawLabels.forEach((iso, idx) => {
                const timestamp = Date.parse(iso);
                const value = Number(rawCosts[idx]);
                if (!isNaN(timestamp) && !isNaN(value) && timestamp >= cutoff) {
                    points.push({ x: timestamp, y: value });
                }
            });
            points.sort((a, b) => a.x - b.x);

            processedData = { main: points, min: [], max: [] };
            showBand = false;
        } else {
            // Weekly or Monthly
            const days = currentRange === "weekly" ? 7 : 30;
            const cutoff = now - (days * msPerDay);

            const buckets = bucketByDay(rawLabels, rawCosts)
                .filter(b => b.ts >= cutoff);

            processedData = {
                main: buckets.map(b => ({ x: b.ts, y: b.avg })),
                min: buckets.map(b => ({ x: b.ts, y: b.min })),
                max: buckets.map(b => ({ x: b.ts, y: b.max }))
            };
            showBand = true;
        }

        if (processedData.main.length === 0) return null;

        // Auto-scaling
        const allValues = [
            ...processedData.main.map(p => p.y),
            ...processedData.max.map(p => p.y)
        ];
        const maxValue = Math.max(...allValues);

        if (maxValue > 1e12) {
            scale = 1e9;
            unit = " (Billions)";
        } else if (maxValue > 1e9) {
            scale = 1e6;
            unit = " (Millions)";
        }

        // Apply scale
        const scaleFn = p => ({ x: p.x, y: p.y / scale });
        return {
            main: processedData.main.map(scaleFn),
            min: processedData.min.map(scaleFn),
            max: processedData.max.map(scaleFn),
            scale,
            unit,
            showBand
        };
    }

    /**
     * Create gradient
     */
    function createGradient(ctx, colorStart, colorEnd) {
        const gradient = ctx.createLinearGradient(0, 0, 0, 400);
        gradient.addColorStop(0, colorStart);
        gradient.addColorStop(1, colorEnd);
        return gradient;
    }

    /**
     * Draw/Update Chart
     */
    function drawChart() {
        const data = prepareData();
        if (!data) {
            chartCanvas.innerHTML = "<div class='text-center text-muted p-5'>No data available</div>";
            return;
        }

        const ctx = canvas.getContext('2d');

        // Destroy existing chart
        if (chartInstance) {
            chartInstance.destroy();
        }

        const datasets = [];

        // 1. Min/Max Band (Background)
        if (data.showBand) {
            datasets.push({
                label: 'Max',
                data: data.max,
                borderColor: 'transparent',
                backgroundColor: 'rgba(99, 102, 241, 0.15)', // Indigo fill (matching main line)
                pointRadius: 0,
                fill: 1, // fill to dataset index 1 (Min)
                tension: 0.4
            });
            datasets.push({
                label: 'Min',
                data: data.min,
                borderColor: 'transparent',
                backgroundColor: 'transparent', // No fill for this boundary
                pointRadius: 0,
                fill: false,
                tension: 0.4
            });
        }

        // 2. Main Average/Value Line (Foreground)
        datasets.push({
            label: 'RC Cost',
            data: data.main,
            borderColor: '#6366f1', // Indigo-500 equivalent, sleek purple/blue
            backgroundColor: (context) => {
                const chart = context.chart;
                const { ctx, chartArea } = chart;
                if (!chartArea) return null;
                // Create gradient fill for the area under the curve
                const gradient = ctx.createLinearGradient(0, chartArea.top, 0, chartArea.bottom);
                gradient.addColorStop(0, 'rgba(99, 102, 241, 0.5)'); // Indigo with opacity
                gradient.addColorStop(1, 'rgba(99, 102, 241, 0.0)'); // Fade to transparent
                return gradient;
            },
            borderWidth: 3,
            tension: 0.4, // Smooth curve
            pointRadius: 0, // No points by default
            pointHoverRadius: 6,
            pointHoverBackgroundColor: '#ffffff',
            pointHoverBorderColor: '#6366f1',
            pointHoverBorderWidth: 3,
            fill: true
        });

        // Config
        const config = {
            type: 'line',
            data: {
                datasets: datasets
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                interaction: {
                    mode: 'index',
                    intersect: false,
                },
                plugins: {
                    legend: {
                        display: false
                    },
                    tooltip: {
                        backgroundColor: 'rgba(255, 255, 255, 0.9)',
                        titleColor: '#1f2937',
                        bodyColor: '#4b5563',
                        borderColor: '#e5e7eb',
                        borderWidth: 1,
                        padding: 10,
                        boxPadding: 4,
                        usePointStyle: true,
                        callbacks: {
                            label: function (context) {
                                let label = context.dataset.label || '';
                                if (label) {
                                    label += ': ';
                                }
                                if (context.parsed.y !== null) {
                                    label += context.parsed.y.toLocaleString();
                                }
                                return label;
                            }
                        }
                    }
                },
                scales: {
                    x: {
                        type: 'time',
                        time: {
                            unit: currentRange === 'daily' ? 'hour' : 'day',
                            displayFormats: {
                                hour: 'HH:mm',
                                day: 'MMM dd'
                            },
                            tooltipFormat: 'MMM dd, HH:mm'
                        },
                        grid: {
                            display: false,
                            drawBorder: false
                        },
                        ticks: {
                            color: '#9ca3af',
                            maxRotation: 0,
                            autoSkip: true,
                            maxTicksLimit: 8
                        }
                    },
                    y: {
                        beginAtZero: true,
                        grid: {
                            color: '#f3f4f6',
                            borderDash: [5, 5],
                            drawBorder: false
                        },
                        ticks: {
                            color: '#9ca3af',
                            callback: function (value) {
                                return value.toLocaleString() + (data.unit ? "" : "");
                            }
                        },
                        title: {
                            display: !!data.unit,
                            text: "RC Cost" + data.unit,
                            color: '#6b7280',
                            font: {
                                size: 12
                            }
                        }
                    }
                }
            }
        };

        chartInstance = new Chart(ctx, config);
    }

    /**
     * Fetch Data
     */
    function fetchData() {
        // Fetch 30 days of data (720 hours)
        fetch("/api/rc_cost_data?hours=720")
            .then(response => response.json())
            .then(data => {
                rawLabels = data.labels || [];
                rawCosts = Array.isArray(data.costs) ? data.costs.map(Number) : [];
                drawChart();
            })
            .catch(error => {
                console.error("RC chart error:", error);
                chartCanvas.innerHTML = "<p class='text-danger text-center'>Error loading chart data</p>";
            });
    }

    // Init
    if (rangeSelectorEl) {
        rangeSelectorEl.addEventListener("click", (event) => {
            const button = event.target.closest("[data-range]");
            if (!button) return;

            const range = button.dataset.range;
            if (range && range !== currentRange) {
                currentRange = range;
                rangeSelectorEl.querySelectorAll("button").forEach(btn => {
                    btn.classList.toggle("active", btn === button);
                });
                drawChart();
            }
        });
    }

    fetchData();
})();
