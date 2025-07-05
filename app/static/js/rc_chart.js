// rc_chart.js
// Handles RC Cost Over Time chart with daily / weekly / monthly rolling averages
// Displays average line and min-max "cloud" using ApexCharts

(function () {
    // DOM elements
    const rangeSelectorEl = document.getElementById("rangeSelector");
    const chartContainer = document.querySelector("#costChart");
    if (!rangeSelectorEl || !chartContainer) return; // nothing to do on pages without chart

    // Chart state
    let currentRange = "daily"; // default view
    let rawLabels = [];
    let rawCosts = [];
    let chart = null;
    const msPerDay = 86400000; // 24h in milliseconds

    /**
     * Group data points by day, calculating min/max/avg for each day
     */
    function bucketByDay(labels, costs) {
        const tzOffsetMs = new Date().getTimezoneOffset() * 60000; // local timezone offset
        const buckets = new Map();
        
        // Group by day
        labels.forEach((iso, idx) => {
            const timestamp = Date.parse(iso);
            const value = Number(costs[idx]);
            
            // Skip invalid data points
            if (isNaN(timestamp) || isNaN(value)) return;
            
            // Create day bucket key (midnight of the day in local timezone)
            const dayKey = Math.floor((timestamp - tzOffsetMs) / msPerDay) * msPerDay + tzOffsetMs;
            
            // Initialize bucket or update existing one
            if (!buckets.has(dayKey)) {
                buckets.set(dayKey, { sum: 0, count: 0, min: value, max: value });
            }
            
            const bucket = buckets.get(dayKey);
            bucket.sum += value;
            bucket.count += 1;
            bucket.min = Math.min(bucket.min, value);
            bucket.max = Math.max(bucket.max, value);
        });
        
        // Convert to sorted array with calculated averages
        return Array.from(buckets.entries())
            .sort((a, b) => a[0] - b[0]) // sort by timestamp
            .map(([ts, b]) => ({
                ts,
                avg: b.sum / b.count,
                min: b.min,
                max: b.max
            }));
    }

    /**
     * Group data by hour intervals
     */
    function bucketByHours(labels, costs, hours) {
        const ms = hours * 3600000; // hours to milliseconds
        const buckets = new Map();
        
        // Group by hour interval
        labels.forEach((iso, idx) => {
            const timestamp = Date.parse(iso);
            const value = Number(costs[idx]);
            
            // Skip invalid data points
            if (isNaN(timestamp) || isNaN(value)) return;
            
            // Create hour bucket key
            const key = Math.floor(timestamp / ms) * ms;
            
            // Initialize bucket or update existing one
            if (!buckets.has(key)) {
                buckets.set(key, { sum: 0, count: 0, min: value, max: value });
            }
            
            const bucket = buckets.get(key);
            bucket.sum += value;
            bucket.count += 1;
            bucket.min = Math.min(bucket.min, value);
            bucket.max = Math.max(bucket.max, value);
        });
        
        // Convert to sorted array with calculated averages
        return Array.from(buckets.entries())
            .sort((a, b) => a[0] - b[0]) // sort by timestamp
            .map(([ts, b]) => ({
                ts,
                avg: b.sum / b.count,
                min: b.min,
                max: b.max
            }));
    }

    /**
     * Calculate rolling averages over a window of days
     */
    function calculateRollingAverage(data, windowDays) {
        if (windowDays <= 1) return data;
        
        const result = [];
        for (let i = 0; i < data.length; i++) {
            // Get window of data points
            const window = data.slice(Math.max(0, i - windowDays + 1), i + 1);
            
            // Calculate rolling average, min and max
            const avg = window.reduce((sum, point) => sum + point.avg, 0) / window.length;
            const min = Math.min(...window.map(point => point.min));
            const max = Math.max(...window.map(point => point.max));
            
            result.push({
                ts: data[i].ts,
                avg,
                min,
                max
            });
        }
        
        return result;
    }

    /**
     * Prepare data series based on the selected time range
     */
    function prepareSeries() {
        const now = Date.now();
        let dataSeries, scale;
        
        // 1. DAILY VIEW: Show raw data points from the last 24 hours
        if (currentRange === "daily") {
            const cutoff = now - msPerDay;
            
            // Filter points from the last 24 hours
            const points = [];
            rawLabels.forEach((iso, idx) => {
                const timestamp = Date.parse(iso);
                const value = Number(rawCosts[idx]);
                
                if (!isNaN(timestamp) && !isNaN(value) && timestamp >= cutoff) {
                    points.push({ ts: timestamp, value });
                }
            });
            
            // Sort by timestamp
            points.sort((a, b) => a.ts - b.ts);
            
            if (points.length === 0) {
                return { mainSeries: [], minMaxSeries: [], scale: 1, showBand: false };
            }
            
            // Calculate scale based on data magnitude
            const maxValue = Math.max(...points.map(p => p.value));
            if (maxValue > 1e12) {
                scale = 1e9; // Scale to billions for trillion+ values
            } else if (maxValue > 1e9) {
                scale = 1e6; // Scale to millions for billion+ values
            } else {
                scale = 1; // No scaling for smaller values
            }
            
            // Create main series (only data points, no band for daily view)
            const mainSeries = points.map(p => ({
                x: p.ts,
                y: p.value / scale
            }));
            
            return {
                mainSeries,
                minMaxSeries: [], // No band for daily view
                scale,
                showBand: false    // Don't show band for daily view
            };
        }
        
        // 2. WEEKLY VIEW: Show daily data with min/max band for the last 7 days
        else if (currentRange === "weekly") {
            const cutoff = now - (7 * msPerDay);
            
            // Get daily buckets for the last 7 days
            const buckets = bucketByDay(rawLabels, rawCosts)
                .filter(bucket => bucket.ts >= cutoff && isFinite(bucket.avg))
                .sort((a, b) => a.ts - b.ts);
            
            if (buckets.length === 0) {
                return { mainSeries: [], minMaxSeries: [], scale: 1, showBand: true };
            }
            
            // Calculate scale
            const maxValue = Math.max(...buckets.map(b => b.max));
            if (maxValue > 1e12) {
                scale = 1e9; // Scale to billions for trillion+ values
            } else if (maxValue > 1e9) {
                scale = 1e6; // Scale to millions for billion+ values
            } else {
                scale = 1; // No scaling for smaller values
            }
            
            // Create series
            const mainSeries = buckets.map(b => ({
                x: b.ts,
                y: b.avg / scale
            }));
            
            const minMaxSeries = buckets.map(b => ({
                x: b.ts,
                y: [b.min / scale, b.max / scale] // [min, max] for the range area
            }));
            
            return {
                mainSeries,
                minMaxSeries,
                scale,
                showBand: true
            };
        }
        
        // 3. MONTHLY VIEW: Show daily data with min/max band for the last 30 days
        else {
            const cutoff = now - (30 * msPerDay);
            
            // Get daily buckets for the last 30 days
            const buckets = bucketByDay(rawLabels, rawCosts)
                .filter(bucket => bucket.ts >= cutoff && isFinite(bucket.avg))
                .sort((a, b) => a.ts - b.ts);
            
            if (buckets.length === 0) {
                return { mainSeries: [], minMaxSeries: [], scale: 1, showBand: true };
            }
            
            // Calculate scale
            const maxValue = Math.max(...buckets.map(b => b.max));
            if (maxValue > 1e12) {
                scale = 1e9; // Scale to billions for trillion+ values
            } else if (maxValue > 1e9) {
                scale = 1e6; // Scale to millions for billion+ values
            } else {
                scale = 1; // No scaling for smaller values
            }
            
            // Create series
            const mainSeries = buckets.map(b => ({
                x: b.ts,
                y: b.avg / scale
            }));
            
            const minMaxSeries = buckets.map(b => ({
                x: b.ts,
                y: [b.min / scale, b.max / scale] // [min, max] for the range area
            }));
            
            return {
                mainSeries,
                minMaxSeries,
                scale,
                showBand: true
            };
        }
    }

    /**
     * Draw the chart with the current data and settings
     */
    function drawChart() {
        const { mainSeries, minMaxSeries, scale, showBand } = prepareSeries();
        
        // Show message if no data
        if (mainSeries.length === 0) {
            chartContainer.innerHTML = "<p class='text-muted'>No RC cost data available.</p>";
            return;
        }
        
        // Configure chart options
        const series = [
            {
                name: "Value",
                type: "line",
                data: mainSeries,
                color: "#0d6efd" // Blue line
            }
        ];
        
        // Add the min/max band series if needed (weekly and monthly views)
        if (showBand) {
            series.push({
                name: "Range",
                type: "rangeArea",
                data: minMaxSeries,
                color: "#cfe2ff" // Light blue band
            });
        }
        
        // Chart configuration
        const options = {
            chart: {
                type: "line",
                height: 350,
                zoom: { enabled: true },
                toolbar: { show: true },
                animations: { enabled: false } // Disable animations for better performance
            },
            markers: {
                size: 0, // Hide markers on all views for cleaner look
                hover: {
                    size: 6, // Still show marker on hover for better user experience
                    sizeOffset: 3
                }
            },
            series: series,
            xaxis: {
                type: "datetime",
                title: { text: "Time" },
                labels: {
                    datetimeUTC: false, // Use local time
                    format: currentRange === "daily" ? "HH:mm" : "MMM dd"
                }
            },
            yaxis: {
                title: {
                    text: scale === 1 ? "RC Cost" : 
                          scale === 1e6 ? "RC Cost (millions)" :
                          "RC Cost (billions)"
                },
                min: 0,
                labels: {
                    formatter: (value) => {
                        if (value == null || isNaN(value)) return "";
                        return value.toLocaleString();
                    }
                }
            },
            stroke: {
                curve: "smooth",
                width: 2
            },
            tooltip: {
                enabled: true,
                custom: function({ series, seriesIndex, dataPointIndex, w }) {
                    // Format the date properly
                    const timestamp = w.globals.seriesX[0][dataPointIndex];
                    const date = new Date(timestamp);
                    const dateStr = currentRange === "daily" 
                        ? date.toLocaleString() 
                        : date.toLocaleDateString();
                    
                    // Get the value from the main series (blue line)
                    const value = w.globals.series[0][dataPointIndex];
                    const valueStr = value !== undefined && !isNaN(value) 
                        ? value.toLocaleString() 
                        : "-";
                    
                    // Start building tooltip HTML
                    let tooltipHtml = `
                        <div class="apexcharts-tooltip-title">
                            ${dateStr}
                        </div>
                        <div class="apexcharts-tooltip-series-group active" style="padding: 8px; display: flex;">
                            <span class="apexcharts-tooltip-marker" style="background-color: #0d6efd;"></span>
                            <div class="apexcharts-tooltip-text">
                                <div class="apexcharts-tooltip-y-group">
                                    <span class="apexcharts-tooltip-text-y-label">Value: </span>
                                    <span class="apexcharts-tooltip-text-y-value">${valueStr}</span>
                                </div>
                            </div>
                        </div>`;
                    
                    // Add min/max if we're showing the band
                    if (showBand) {
                        // Direct access to the range area data
                        const rangeIdx = w.globals.seriesNames.findIndex(name => name === "Range");
                        
                        if (rangeIdx !== -1) {
                            // Get min and max from the range area series
                            const min = w.globals.seriesRangeStart[rangeIdx][dataPointIndex];
                            const max = w.globals.seriesRangeEnd[rangeIdx][dataPointIndex];
                            
                            if (min !== undefined && max !== undefined) {
                                const minStr = min.toLocaleString();
                                const maxStr = max.toLocaleString();
                                
                                tooltipHtml += `
                                <div class="apexcharts-tooltip-series-group active" style="padding: 8px; display: flex;">
                                    <span class="apexcharts-tooltip-marker" style="background-color: #cfe2ff;"></span>
                                    <div class="apexcharts-tooltip-text">
                                        <div class="apexcharts-tooltip-y-group">
                                            <span class="apexcharts-tooltip-text-y-label">Min / Max: </span>
                                            <span class="apexcharts-tooltip-text-y-value">${minStr} / ${maxStr}</span>
                                        </div>
                                    </div>
                                </div>`;
                            }
                        }
                    }
                    
                    return tooltipHtml;
                }
            },
            // Additional visual configurations
            dataLabels: {
                enabled: false
            },
            grid: {
                borderColor: '#f1f1f1',
                row: {
                    colors: ['transparent', 'transparent']
                }
            },
            legend: {
                position: 'top',
                horizontalAlign: 'left'
            }
        };
        
        // Update existing chart or create new one
        if (chart) {
            chart.updateOptions(options);
        } else {
            // Clean container
            chartContainer.innerHTML = "";
            
            // Create new chart
            chart = new ApexCharts(chartContainer, options);
            window.costChartInstance = chart;
            
            try {
                chart.render();
            } catch (err) {
                console.error("ApexCharts render error:", err);
                chartContainer.innerHTML = "<p class='text-danger'>Error rendering chart. Please try refreshing the page.</p>";
            }
        }
    }

    /**
     * Fetch RC cost data from the API
     */
    function fetchData() {
        fetch("/api/rc_cost_data?hours=720") // Get 30 days of data
            .then(response => response.json())
            .then(data => {
                rawLabels = data.labels || [];
                rawCosts = Array.isArray(data.costs) ? data.costs.map(cost => Number(cost)) : [];
                drawChart();
            })
            .catch(error => {
                console.error("RC cost data fetch error:", error);
                chartContainer.innerHTML = "<p class='text-danger'>Error loading chart data. Please try refreshing the page.</p>";
            });
    }

    // Initialize chart
    if (rangeSelectorEl) {
        // Set up range selector buttons (daily/weekly/monthly)
        rangeSelectorEl.addEventListener("click", (event) => {
            const button = event.target.closest("[data-range]");
            if (!button) return;
            
            const range = button.dataset.range;
            if (range && range !== currentRange) {
                // Update active state
                currentRange = range;
                rangeSelectorEl.querySelectorAll("button").forEach(btn => {
                    btn.classList.toggle("active", btn === button);
                });
                
                // Redraw chart with new range
                drawChart();
            }
        });
    }

    // Initial data fetch
    fetchData();
})();
