// Global variables to keep track of filter and sort state
let currentMinVolume = 0;
let currentMinAvgBar = 0;
let currentSortField = null;
let currentSortOrder = 'asc';

document.getElementById("fetchData").addEventListener("click", fetchAndStoreSymbols);
document.getElementById("updateAvgBar").addEventListener("click", updateAvgBarsForStoredSymbols);
document.getElementById("filterData").addEventListener("click", applyFilters);
document.getElementById("displayData").addEventListener("click", displayStoredData);
document.getElementById("sortAvgBarAsc").addEventListener("click", () => sortAssets('avgBar', 'asc'));
document.getElementById("sortAvgBarDesc").addEventListener("click", () => sortAssets('avgBar', 'desc'));
document.getElementById("sortVolumeAsc").addEventListener("click", () => sortAssets('volume', 'asc'));
document.getElementById("sortVolumeDesc").addEventListener("click", () => sortAssets('volume', 'desc'));
document.getElementById("sortOpenInterestAsc").addEventListener("click", () => sortAssets('openInterest', 'asc'));
document.getElementById("sortOpenInterestDesc").addEventListener("click", () => sortAssets('openInterest', 'desc'));

document.getElementById("resetFilters").addEventListener("click", resetFilters); // Add this button ID to your HTML

function showProgressBar() {
    document.getElementById("progressContainer").style.display = "block";
    document.getElementById("progressLabel").style.display = "block";
    updateProgressBar(0, "");
}

function hideProgressBar() {
    document.getElementById("progressContainer").style.display = "none";
    document.getElementById("progressLabel").style.display = "none";
}

function updateProgressBar(percentage, currentSymbol) {
    const progressBar = document.getElementById("progressBar");
    const progressLabel = document.getElementById("progressLabel");

    progressBar.style.width = `${percentage}%`;
    progressBar.textContent = `${percentage.toFixed(2)}%`;
    progressLabel.textContent = `Updating: ${currentSymbol} (${percentage.toFixed(2)}% complete)`;
}

// Fetch all USDT-M futures symbols and store them in localStorage with 24h traded volume and open interest converted to USDT
async function fetchAndStoreSymbols() {
    showProgressBar();
    let progressPercentage = 0;
    try {
        progressPercentage = progressPercentage + 1;
        updateProgressBar(progressPercentage, 'requesting exchange info...');
        const response = await fetch("https://fapi.binance.com/fapi/v1/exchangeInfo");
        const data = await response.json();
        progressPercentage = progressPercentage + 48;
        updateProgressBar(progressPercentage, `${data.symbols.length} symbols received`);
        const symbols = data.symbols.map(symbol => ({
            symbol: symbol.symbol,
            volume24h: 0, // Placeholder for 24h volume
            openInterest: 0 // Placeholder for open interest in USDT
        }));

        progressPercentage = progressPercentage + 1;
        updateProgressBar(progressPercentage, 'requesting 24h tickers...');

        const volumeResponse = await fetch("https://fapi.binance.com/fapi/v1/ticker/24hr");
        const volumeData = await volumeResponse.json();

        progressPercentage = 100;
        updateProgressBar(progressPercentage, 'ok..');

        let totalAssets = symbols.length;
        let symbolNum = 0;

        const openInterestPromises = symbols.map(async (symbol) => {
            try {
                const oiResponse = await fetch(`https://fapi.binance.com/fapi/v1/openInterest?symbol=${symbol.symbol}`);
                const oiData = await oiResponse.json();
                const volumeInfo = volumeData.find(v => v.symbol === symbol.symbol);
                const lastPrice = volumeInfo ? parseFloat(volumeInfo.lastPrice) : 0;

                // Convert open interest to USDT
                symbol.openInterest = (parseFloat(oiData.openInterest) || 0) * lastPrice;
                progressPercentage = ((symbolNum + 1) / totalAssets) * 100;
                updateProgressBar(progressPercentage, `${symbol.symbol}: ${lastPrice}`);
            } catch (error) {
                console.error(`Error fetching open interest for ${symbol.symbol}:`, error);
                symbol.openInterest = 0;
            }
            symbolNum++;
        });

        await Promise.all(openInterestPromises);

        symbols.forEach(symbol => {
            const volumeInfo = volumeData.find(v => v.symbol === symbol.symbol);
            if (volumeInfo) {
                symbol.volume24h = parseFloat(volumeInfo.quoteVolume); // Assign 24h volume
            }
        });

        if (symbols.length > 0) {
            localStorage.setItem("assets", JSON.stringify(symbols));
            console.log("Stored assets with 24h volume and open interest (converted to USDT):", symbols);
            displayAssets(symbols);
        } else {
            console.warn("No symbols to store.");
            alert("No symbols found. Please try again.");
        }
    } catch (error) {
        console.error("Error fetching symbol data:", error);
        alert("Failed to fetch symbol data. Check your connection.");
    } finally {
        hideProgressBar();
    }
}

async function updateAvgBarsForStoredSymbols() {
    let assets = JSON.parse(localStorage.getItem("assets")) || [];

    if (assets.length === 0) {
        alert("No data found in local storage. Please fetch symbols first.");
        return;
    }

    showProgressBar();

    const interval = document.getElementById("intervalSelect").value;
    const numBars = parseInt(document.getElementById("numBars").value, 10);
    const totalAssets = assets.length;

    for (let i = 0; i < totalAssets; i++) {
        const asset = assets[i];
        try {
            const candles = await fetchCandles(asset.symbol, interval, numBars);
            asset.avgBarPercentage = calculateAverageVolatility(candles);
        } catch (error) {
            console.error(`Error calculating avg bar for ${asset.symbol}:`, error);
            asset.avgBarPercentage = "N/A";
        }

        const progressPercentage = ((i + 1) / totalAssets) * 100;
        updateProgressBar(progressPercentage, asset.symbol);
    }

    localStorage.setItem("assets", JSON.stringify(assets));
    console.log("Updated assets with avg bar:", assets);
    displayStoredData();
    hideProgressBar();
}

async function fetchCandles(symbol, interval, limit) {
    try {
        const endpoint = `https://fapi.binance.com/fapi/v1/klines?symbol=${symbol}&interval=${interval}&limit=${limit + 1}`;
        const response = await fetch(endpoint);
        const data = await response.json();
        if (data) {
            // Skip the first bar and return only the closed bars
            return data.slice(1);
        } else {
            return [];
        }
    } catch (error) {
        console.error(`Error fetching candles for ${symbol}:`, error);
        return [];
    }
}

function calculateAverageVolatility(candles) {
    if (!candles || candles.length === 0) return "N/A";
    const totalVolatility = candles.reduce((sum, candle) => {
        const high = parseFloat(candle[2]);
        const low = parseFloat(candle[3]);
        return sum + ((high - low) / low) * 100;
    }, 0);
    return (totalVolatility / candles.length).toFixed(2);
}

function applyFilters() {
    const minVolume = document.getElementById("filterVolume").value;
    const minAvgBar = document.getElementById("filterAvgBar").value;

    currentMinVolume = minVolume !== "" ? parseFloat(minVolume) : 0;
    currentMinAvgBar = minAvgBar !== "" ? parseFloat(minAvgBar) : 0;

    displayStoredData();
}

function sortAssets(field, order) {
    currentSortField = field;
    currentSortOrder = order;

    displayStoredData();
}

function resetFilters() {
    currentMinVolume = 0;
    currentMinAvgBar = 0;
    currentSortField = null;
    currentSortOrder = 'asc';

    document.getElementById("filterVolume").value = '';
    document.getElementById("filterAvgBar").value = '';

    displayStoredData();
}

function displayStoredData() {
    const storedAssets = JSON.parse(localStorage.getItem("assets")) || [];
    if (storedAssets.length === 0) {
        alert("No data found in local storage.");
        return;
    }

    let filteredAssets = storedAssets.filter(asset => {
        let volumeCheck = true;
        let avgBarCheck = true;

        if (currentMinVolume > 0) {
            volumeCheck = asset.volume24h > currentMinVolume;
        }

        if (currentMinAvgBar > 0) {
            avgBarCheck = parseFloat(asset.avgBarPercentage) > currentMinAvgBar;
        }

        return volumeCheck && avgBarCheck;
    });

    if (currentSortField) {
        filteredAssets.sort((a, b) => {
            const valA = currentSortField === 'avgBar' ? parseFloat(a.avgBarPercentage) || 0 : currentSortField === 'openInterest' ? a.openInterest : a.volume24h;
            const valB = currentSortField === 'avgBar' ? parseFloat(b.avgBarPercentage) || 0 : currentSortField === 'openInterest' ? b.openInterest : b.volume24h;

            return currentSortOrder === 'asc' ? valA - valB : valB - valA;
        });
    }

    displayAssets(filteredAssets);
}

function displayAssets(assets) {
    const tbody = document.querySelector("#assetTable tbody");
    tbody.innerHTML = "";

    if (assets.length === 0) {
        const noDataRow = document.createElement("tr");
        noDataRow.innerHTML = `<td colspan="4">No data available</td>`;
        tbody.appendChild(noDataRow);
        console.warn("No assets to display.");
        return;
    }

    assets.forEach(asset => {
        const row = document.createElement("tr");
        row.innerHTML = `
            <td><a href="https://www.binance.com/en/futures/${asset.symbol}" target="_blank">${asset.symbol}</a></td>
            <td>${asset.volume24h !== 0 ? formatFinanceNumber(asset.volume24h) : "N/A"}</td>           
            <td>${asset.avgBarPercentage || ""}</td>
            <td>${asset.openInterest !== 0 ? formatFinanceNumber(asset.openInterest) : "N/A"}</td>
        `;
        tbody.appendChild(row);
    });

    console.log("Table populated with assets:", assets);
}

document.addEventListener("DOMContentLoaded", () => {
    displayStoredData();
});

function formatFinanceNumber(value) {
    if (value >= 1e12) {
        return `$${(value / 1e12).toFixed(2)}T`; // Trillion
    } else if (value >= 1e9) {
        return `$${(value / 1e9).toFixed(2)}B`; // Billion
    } else if (value >= 1e6) {
        return `$${(value / 1e6).toFixed(2)}M`; // Million
    } else if (value >= 1e3) {
        return `$${(value / 1e3).toFixed(2)}K`; // Thousand
    } else {
        return `$${value.toFixed(2)}`; // Less than a thousand
    }
}
