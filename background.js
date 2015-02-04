chrome.app.runtime.onLaunched.addListener(function()
{
    chrome.app.window.create("index.html",
    {
        bounds: {width: 712, height: 528},
        resizable: false
    });
});
