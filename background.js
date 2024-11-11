chrome.runtime.onInstalled.addListener(() => {
    console.log("Binance Futures Sorter Extension Installed");
});

chrome.action.onClicked.addListener(() => {
    chrome.tabs.create({ url: chrome.runtime.getURL("content.html") });
});