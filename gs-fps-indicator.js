var GS_StatusBar = {};

(function () {

    var PATH = ['Custom Scripts', 'Visuals', 'Status Bar'];

    var UI = {
        Enabled: Menu.AddToggle(PATH, 'Enable', true),
        Reset:   Menu.AddButton(PATH, 'Reset Position', function () { pX = -1; pY = -1; })
    };

    var pX = -1, pY = -1;
    var isMoving = false, dX = 0, dY = 0;

    var SAMPLE_COUNT = 64;
    var SAMPLE_TIME  = 0.5;
    var SERVER_TICK  = 1 / 30;

    var ftBuf = [];
    var ftPos = 0;
    var smoothFps = 0;
    var prevTime = 0;

    for (var i = 0; i < SAMPLE_COUNT; i++) ftBuf[i] = 0;

    var spdVal = 0;
    var lossVal = 0;
    var font = null;
    var fontSmall = null;

    function round(n) { return Math.floor(n + 0.5); }
    function clamp(v, lo, hi) { return v < lo ? lo : v > hi ? hi : v; }

    function getSafePing() {
        try { var p = NetChannel.GetAvgLatency(0) * 1000; if (p > 0) return Math.floor(p); } catch (e) {}
        try { var p2 = NetChannel.GetLatency(0) * 1000; if (p2 > 0) return Math.floor(p2); } catch (e2) {}
        try { var p3 = NetChannel.GetAvgLatency() * 1000; if (p3 > 0) return Math.floor(p3); } catch (e3) {}
        return 0;
    }

    function getPacketLoss() {
        try { var v = NetChannel.GetAvgLoss(0); if (v !== undefined && !isNaN(v)) return round(clamp(v * 100, 0, 100)); } catch (e) {}
        try { var v2 = NetChannel.GetAvgLoss(1); if (v2 !== undefined && !isNaN(v2)) return round(clamp(v2 * 100, 0, 100)); } catch (e2) {}
        try { var v3 = NetChannel.GetPacketLoss(0); if (v3 !== undefined && !isNaN(v3)) return round(clamp(v3 * 100, 0, 100)); } catch (e3) {}
        try { var v4 = NetChannel.GetPacketLoss(1); if (v4 !== undefined && !isNaN(v4)) return round(clamp(v4 * 100, 0, 100)); } catch (e4) {}
        try { var v5 = NetChannel.GetAvgLoss(); if (v5 !== undefined && !isNaN(v5)) return round(clamp(v5 * 100, 0, 100)); } catch (e5) {}
        try { var v6 = NetChannel.GetPacketLoss(); if (v6 !== undefined && !isNaN(v6)) return round(clamp(v6 * 100, 0, 100)); } catch (e6) {}
        try { var v7 = NetChannel.GetLoss(0); if (v7 !== undefined && !isNaN(v7)) return round(clamp(v7 * 100, 0, 100)); } catch (e7) {}
        try { var v8 = NetChannel.GetLoss(); if (v8 !== undefined && !isNaN(v8)) return round(clamp(v8 * 100, 0, 100)); } catch (e8) {}
        return 0;
    }

    function getHero() {
        try { return EntitySystem.GetLocalHero(); } catch (e) {}
        try { return EntityList.GetLocalHero(); } catch (e2) {}
        return null;
    }

    function heroAlive(h) {
        if (!h) return false;
        try { return h.IsAlive(); } catch (e) {}
        try { return h.GetHealth() > 0; } catch (e2) {}
        return false;
    }

    function getSpeed() {
        var h = getHero();
        if (!h || !heroAlive(h)) return 0;
        try {
            var vx = h.GetProperty("CBodyComponentBaseAnimGraph", "m_vecVelocity.x");
            var vy = h.GetProperty("CBodyComponentBaseAnimGraph", "m_vecVelocity.y");
            if (vx !== undefined && vy !== undefined) { var spd = Math.sqrt(vx * vx + vy * vy); if (spd > 0) return round(spd); }
        } catch (e) {}
        try {
            var vel = h.GetProperty("CBodyComponentBaseAnimGraph", "m_vecVelocity");
            if (vel) { var sx = vel.x || 0, sy = vel.y || 0; var spd2 = Math.sqrt(sx * sx + sy * sy); if (spd2 > 0) return round(spd2); }
        } catch (e2) {}
        try { var ms = h.GetMoveSpeed(); if (ms > 0 && ms < 1200) { try { if (h.IsMoving()) return round(ms); } catch (e3) { return round(ms); } } } catch (e4) {}
        try { var ms2 = h.GetIdealSpeed(); if (ms2 > 0 && ms2 < 1200) return round(ms2); } catch (e5) {}
        try { var cms = h.GetProperty("CDOTA_BaseNPC", "m_flCurrentMoveSpeed"); if (cms > 0) return round(cms); } catch (e6) {}
        try {
            var vx2 = h.GetProperty("CGameSceneNode", "m_vecVelocity.x");
            var vy2 = h.GetProperty("CGameSceneNode", "m_vecVelocity.y");
            if (vx2 !== undefined && vy2 !== undefined) { var spd3 = Math.sqrt(vx2 * vx2 + vy2 * vy2); if (spd3 > 0) return round(spd3); }
        } catch (e7) {}
        return 0;
    }

    function calcFPS() {
        var now = Date.now() / 1000;
        if (prevTime > 0) {
            var dt = now - prevTime;
            if (dt > 0.001 && dt < 1) { ftBuf[ftPos] = dt; ftPos = (ftPos + 1) % SAMPLE_COUNT; }
        }
        prevTime = now;
        var sum = 0, cnt = 0, idx = ftPos;
        for (var i = 0; i < SAMPLE_COUNT; i++) {
            idx = (idx - 1 + SAMPLE_COUNT) % SAMPLE_COUNT;
            var ft = ftBuf[idx];
            if (ft <= 0) break;
            sum += ft; cnt++;
            if (sum >= SAMPLE_TIME) break;
        }
        if (cnt === 0) return 0;
        var fps = round(1 / (sum / cnt));
        if (Math.abs(fps - smoothFps) > 5) smoothFps = fps;
        return smoothFps;
    }

    var C_RED = [255, 60, 80];
    var C_YEL = [255, 222, 0];
    var C_GRN = [159, 202, 43];
    var C_WHT = [255, 255, 255];

    function pingCol(v) { return v < 40 ? C_GRN : v < 100 ? C_YEL : C_RED; }
    function fpsCol(v) { return v < round(1 / SERVER_TICK) ? C_RED : C_GRN; }
    function lossCol(v) { if (v <= 2) return C_GRN; if (v <= 5) return C_YEL; return C_RED; }
    function spdCol(v) { if (v <= 0) return C_WHT; if (v < 200) return C_YEL; return C_GRN; }

    function drawShadowText(f, x, y, str, r, g, b, a) {
        if (!f) return;
        str = '' + str;
        Renderer.SetDrawColor(0, 0, 0, Math.min(255, a));
        f.DrawText(x + 1, y + 1, str);
        Renderer.SetDrawColor(r, g, b, a);
        f.DrawText(x, y, str);
    }

    function drawGradH(x, y, w, h, r, g, b, a1, a2) {
        if (w <= 0 || h <= 0) return;
        for (var i = 0; i < w; i++) {
            var t = w > 1 ? i / (w - 1) : 1;
            var a = round(a1 + (a2 - a1) * t);
            if (a > 0) { Renderer.SetDrawColor(r, g, b, a); Renderer.DrawFilledRect(x + i, y, 1, h); }
        }
    }

    function onDraw() {
        if (!UI.Enabled.GetValue()) return;

        if (!font) {
            font = Renderer.LoadFont('Verdana', 14, Enum.FontWeight.BOLD);
            fontSmall = Renderer.LoadFont('Verdana', 9, Enum.FontWeight.NORMAL);
        }
        if (!font) return;
        if (!fontSmall) fontSmall = font;

        var fps = calcFPS();
        var ping = round(clamp(getSafePing(), 0, 1000));
        lossVal = getPacketLoss();
        spdVal = getSpeed();

        var screen = Renderer.GetScreenSize();
        var sw = screen[0], sh = screen[1];

        var blockW = 90;
        var count = 4;
        var totalW = blockW * count;
        var padY = 7;
        var panelH = 28;
        var fadeW = round(totalW * 0.5);

        if (pX < 0 || pY < 0) {
            pX = round(sw / 2 - totalW / 2);
            pY = sh - panelH;
        }

        var m = Input.GetCursorPos();
        var ctrlDown = Input.IsKeyDown(Enum.ButtonCode.KEY_LCONTROL);
        var lmbDown = Input.IsKeyDown(Enum.ButtonCode.MOUSE_LEFT);

        if (ctrlDown && lmbDown) {
            if (!isMoving) {
                if (m[0] >= pX && m[0] <= pX + totalW && m[1] >= pY && m[1] <= pY + panelH) {
                    isMoving = true;
                    dX = m[0] - pX;
                    dY = m[1] - pY;
                }
            } else {
                pX = clamp(m[0] - dX, 0, sw - totalW);
                pY = clamp(m[1] - dY, 0, sh - panelH);
            }
        } else {
            isMoving = false;
        }

        Renderer.PushDrawOptions({ priority: 999999, drawOverUI: true });

        drawGradH(pX - fadeW, pY, fadeW, panelH, 0, 0, 0, 0, 80);
        Renderer.SetDrawColor(0, 0, 0, 80);
        Renderer.DrawFilledRect(pX, pY, totalW, panelH);
        drawGradH(pX + totalW, pY, fadeW, panelH, 0, 0, 0, 80, 0);

        var blocks = [
            { val: ping, lbl: 'PING', c: pingCol(ping) },
            { val: fps, lbl: 'FPS', c: fpsCol(fps) },
            { val: lossVal + '%', lbl: 'LOSS', c: lossCol(lossVal) },
            { val: spdVal, lbl: 'SPEED', c: spdCol(spdVal) }
        ];

        for (var i = 0; i < blocks.length; i++) {
            var bx = pX + i * blockW;
            var b = blocks[i];
            var valStr = '' + b.val;
            drawShadowText(font, bx + 8, pY + padY - 1, valStr, b.c[0], b.c[1], b.c[2], 255);
            var valW = font.GetTextSize(valStr)[0] + 3;
            drawShadowText(fontSmall, bx + 8 + valW, pY + padY + 4, b.lbl, 255, 255, 255, 175);
            if (i < blocks.length - 1) {
                Renderer.SetDrawColor(255, 255, 255, 20);
                Renderer.DrawFilledRect(bx + blockW - 1, pY + 6, 1, panelH - 12);
            }
        }

        if (ctrlDown) {
            Renderer.SetDrawColor(100, 180, 255, 140);
            Renderer.DrawOutlineRect(pX - 2, pY - 2, totalW + 4, panelH + 4, 0, 0, 1);
            drawShadowText(fontSmall, pX, pY - 14, 'Ctrl + LMB to drag', 100, 180, 255, 220);
        }

        Renderer.PopDrawOptions();
    }

    RegisterScript({ OnDraw: onDraw }, 'StatusBar');

})();
