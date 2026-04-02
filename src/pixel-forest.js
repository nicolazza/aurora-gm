/**
 * Pixel Art Tropical Forest — Canvas Background
 * V4: Low-res render canvas + drawImage upscale for Safari compatibility.
 * Runs at 30fps with STEP=2 for consistent cross-browser timelapse.
 */

let _forestAnim = null;
let _forestCleanup = null;
let _fadeMask = false;

export function initForest() {
    const cvs = document.getElementById('pixel-forest');
    if (!cvs || cvs._forestInit || window.innerWidth < 768) return;
    cvs._forestInit = true;

    const parent = cvs.parentElement;
    const displayW = parent.offsetWidth;
    const displayH = parent.offsetHeight;
    const scale = Math.max(3, Math.min(5, Math.round(displayW / 300)));
    const W = Math.floor(displayW / scale);
    const H = Math.floor(displayH / scale);
    if (W < 60 || H < 40) return;

    cvs.width = displayW;
    cvs.height = displayH;
    const ctx = cvs.getContext('2d');
    ctx.imageSmoothingEnabled = false;
    ctx.webkitImageSmoothingEnabled = false;
    ctx.mozImageSmoothingEnabled = false;

    const renderCvs = document.createElement('canvas');
    renderCvs.width = W;
    renderCvs.height = H;
    const rCtx = renderCvs.getContext('2d');

    let _seed = 1;
    function rand() { _seed = (_seed * 16807 + 13) % 2147483647; return (_seed & 0x7fffffff) / 2147483647; }

    let _ctx = rCtx;
    function dp(x, y, c) {
        x = Math.round(x); y = Math.round(y);
        if (x < 0 || x >= W || y < 0 || y >= H) return;
        _ctx.fillStyle = c;
        _ctx.fillRect(x, y, 1, 1);
    }
    function lerp(a, b, t) { return a + (b - a) * Math.max(0, Math.min(1, t)); }
    function lc(c1, c2, t) {
        t = Math.max(0, Math.min(1, t));
        const p = s => parseInt(s, 16);
        const r = Math.round(lerp(p(c1.slice(1,3)), p(c2.slice(1,3)), t));
        const g = Math.round(lerp(p(c1.slice(3,5)), p(c2.slice(3,5)), t));
        const b = Math.round(lerp(p(c1.slice(5,7)), p(c2.slice(5,7)), t));
        return '#' + [r,g,b].map(v => v.toString(16).padStart(2,'0')).join('');
    }
    function pn(x, y) { return (Math.sin(x*12.9898+y*78.233)*43758.5453) % 1; }

    const sx = v => Math.round(v * W / 240);
    const sy = v => Math.round(v * H / 135);

    function drawSky() {
        for (let y = 0; y < H; y++) {
            const t = y / H; let c;
            if (t < 0.40) c = lc('#6CC8FF','#A0DCF0',t/0.40);
            else if (t < 0.60) c = lc('#A0DCF0','#c0e8d0',(t-0.40)/0.20);
            else if (t < 0.75) c = lc('#c0e8d0','#80b868',(t-0.60)/0.15);
            else c = lc('#62a842','#3a7a22',(t-0.75)/0.25);
            for (let x = 0; x < W; x++) dp(x, y, c);
        }
    }

    function mountain(peaks, baseY, fillTop, fillBot, shadowOff) {
        const mLine = [];
        for (let x = 0; x < W; x++) {
            let y = baseY;
            for (const pk of peaks) { const d = (x - pk.x) / pk.w; y = Math.min(y, pk.y + pk.h * d * d); }
            y += Math.sin(x * 0.3) * 0.8 + Math.sin(x * 0.7) * 0.4;
            mLine.push(Math.round(y));
        }
        for (let x = 0; x < W; x++) {
            for (let y = mLine[x]; y <= baseY; y++) {
                const t = (y - mLine[x]) / Math.max(1, baseY - mLine[x]);
                const isLeft = x < mLine.indexOf(Math.min(...mLine.slice(Math.max(0,x-sx(20)), x+sx(20))));
                dp(x, y, lc(lc(fillTop, fillBot, t), '#0a1a0a', isLeft ? 0 : shadowOff));
            }
        }
    }
    function drawMountains() {
        mountain([{x:sx(40),y:H*0.38,h:sy(25),w:sx(35)},{x:sx(120),y:H*0.32,h:sy(30),w:sx(40)},{x:sx(200),y:H*0.36,h:sy(28),w:sx(32)}], Math.round(H*0.58),'#7aaa98','#6a9a88',0.12);
        mountain([{x:sx(25),y:H*0.40,h:sy(20),w:sx(28)},{x:sx(80),y:H*0.36,h:sy(24),w:sx(35)},{x:sx(160),y:H*0.34,h:sy(28),w:sx(38)},{x:sx(220),y:H*0.38,h:sy(22),w:sx(30)}], Math.round(H*0.62),'#5a9a5a','#4a8848',0.18);
        mountain([{x:sx(10),y:H*0.46,h:sy(18),w:sx(25)},{x:sx(70),y:H*0.42,h:sy(22),w:sx(32)},{x:sx(130),y:H*0.44,h:sy(20),w:sx(28)},{x:sx(190),y:H*0.40,h:sy(24),w:sx(34)},{x:sx(235),y:H*0.45,h:sy(16),w:sx(22)}], Math.round(H*0.68),'#3e8a38','#2d7a28',0.22);
    }

    const gnd = [];
    const edgeW = Math.round(W * 0.25);
    for (let x = 0; x < W; x++) {
        let y = H * 0.88;
        if (x < edgeW) y -= (edgeW - x) * 0.2 * (135 / H);
        if (x > W - edgeW) y -= (x - (W - edgeW)) * 0.08 * (135 / H);
        y += Math.sin(x * 24 / W) * (H * 0.008) + Math.sin(x * 65 / W) * (H * 0.004);
        gnd.push(Math.round(y));
    }
    function drawGround() {
        for (let x = 0; x < W; x++) {
            for (let y = gnd[x]; y < H; y++) {
                const d = (y - gnd[x]) / (H - gnd[x]);
                dp(x, y, d < 0.06 ? '#5cb83c' : d < 0.25 ? '#4da82c' : d < 0.55 ? '#3f9222' : '#35801a');
            }
            if (x%2===0) dp(x, gnd[x]-1, ['#6cc84c','#5cb83c','#78d058'][x%3]);
            if (x%4===1) dp(x, gnd[x]-2, '#88dd66');
            if (x%7===0) { dp(x, gnd[x]-1,'#72cc52'); dp(x, gnd[x]-2,'#82d860'); dp(x, gnd[x]-3,'#96e874'); }
        }
    }

    function cloud(cx, cy, rx, ry) {
        cx = Math.round(cx); cy = Math.round(cy);
        for (let dy = -ry; dy <= ry; dy++) {
            const rh = Math.round(rx*Math.sqrt(Math.max(0,1-(dy*dy)/(ry*ry))));
            for (let dx = -rh; dx <= rh; dx++) {
                const dist = Math.sqrt(dx*dx/(rx*rx)+dy*dy/(ry*ry));
                if (dist > 0.88 && pn(dx,dy) > 0.35) continue;
                dp(cx+dx, cy+dy, dist < 0.45 ? '#ffffff' : lc('#ffffff','#e0eaff',(dist-0.45)*1.8));
            }
        }
    }
    function drawStaticClouds() {
        cloud(sx(40),sy(14),sx(14),sy(3)); cloud(sx(100),sy(8),sx(20),sy(4)); cloud(sx(175),sy(18),sx(12),sy(3));
        cloud(sx(220),sy(10),sx(9),sy(2)); cloud(sx(70),sy(28),sx(8),sy(2)); cloud(sx(145),sy(5),sx(10),sy(3));
    }
    function preRenderCloud(rx, ry) {
        const off = document.createElement('canvas');
        off.width = rx*2+4; off.height = ry*2+4;
        const oc = off.getContext('2d');
        const ocx = rx+2, ocy = ry+2;
        for (let dy = -ry; dy <= ry; dy++) {
            const rh = Math.round(rx*Math.sqrt(Math.max(0,1-(dy*dy)/(ry*ry))));
            for (let dx = -rh; dx <= rh; dx++) {
                const dist = Math.sqrt(dx*dx/(rx*rx)+dy*dy/(ry*ry));
                if (dist > 0.88 && pn(dx,dy) > 0.35) continue;
                oc.fillStyle = dist < 0.45 ? '#ffffff' : lc('#ffffff','#e0eaff',(dist-0.45)*1.8);
                oc.fillRect(ocx+dx, ocy+dy, 1, 1);
            }
        }
        return off;
    }

    const SP = {
        palm:       { bark:['#3e2010','#4a2a14','#5a3520','#6d4428','#7e5634','#8a6438','#7e5634','#6d4428','#5a3520','#4a2a14'], hl:'#b08050' },
        tropical:   { bark:['#3a3028','#44392e','#504838','#5c5444','#686050','#5c5444','#504838','#44392e'], hl:'#8a8070', ld:'#0e3e0e', ll:'#70d870' },
        silver:     { bark:['#58584e','#646458','#707066','#7c7c72','#88887e','#7c7c72','#707066','#646458'], hl:'#a0a090', ld:'#0e400e', ll:'#78dd78' },
        mahogany:   { bark:['#3a1818','#4a2222','#5a2e2e','#6a3a3a','#784444','#6a3a3a','#5a2e2e','#4a2222'], hl:'#905050', ld:'#0e3a0e', ll:'#68c868' },
        jacaranda:  { bark:['#3a2838','#483444','#584050','#684c5c','#584050','#483444','#3a2838','#483444'], hl:'#886878', ld:'#1a4828', ll:'#5ab868', fl:'#9966dd' },
        flamboyant: { bark:['#3a2a18','#483824','#584830','#685840','#584830','#483824','#3a2a18','#483824'], hl:'#907848', ld:'#1a5820', ll:'#60c060', fl:'#ff4422' },
        cherry:     { bark:['#4a2020','#582a2a','#683636','#784242','#683636','#582a2a','#4a2020','#582a2a'], hl:'#a06060', ld:'#2a5c2a', ll:'#68cc68', fl:'#ff88bb' },
        birch:      { bark:['#c8c0b0','#d8d0c0','#e8e0d0','#d8d0c0','#b8b0a0','#a8a098','#c8c0b0','#d8d0c0'], hl:'#f0e8e0', ld:'#185818', ll:'#6acc6a' },
    };

    function palmTrunk(bx, by, height, lean) {
        const b = SP.palm.bark; let tx = bx;
        for (let i = 0; i < height; i++) {
            const y = by-i, ci = Math.floor(i/2)%b.length;
            const bw = i<4?2.5:i<8?2:(i>height-4?1:1.5);
            for (let dx = -Math.ceil(bw); dx <= Math.ceil(bw); dx++) {
                if (Math.abs(dx)>bw) continue;
                dp(tx+dx, y, lc(b[ci],'#1a0a04',(Math.abs(dx)/bw)*0.5));
            }
            const hl = Math.floor(i/2)%b.length;
            if (hl===3||hl===5) { dp(tx-1,y,lc(b[ci],SP.palm.hl,0.3)); dp(tx,y,lc(b[ci],SP.palm.hl,0.2)); }
            if (i>3 && i%Math.max(2,Math.round(2.8/Math.abs(lean||0.01)))===0) tx+=Math.sign(lean);
        }
        return {x:tx, y:by-height};
    }
    function palmFrond(fx, fy, angle, len, thick) {
        let x=fx, y=fy;
        for (let i=0;i<len;i++) {
            const t=i/len;
            const dx=Math.cos(angle)*(1-t*0.25), dy=Math.sin(angle)*(1-t*0.6)+t*t*1.4;
            x+=dx; y+=dy;
            const col=lc('#1a5c18','#88ee66',t), colL=lc('#226a20','#a0ff80',t);
            dp(x,y,col);
            if (i>0&&i<len-1) {
                const mag=Math.sqrt(dx*dx+dy*dy), px=-dy/mag, py=dx/mag;
                if (i%2===0){dp(x+px,y+py,colL);if(thick>1&&i<len-3)dp(x+px*2,y+py*2,lc(colL,'#c0ffaa',0.3));}
                else{dp(x-px,y-py,colL);if(thick>1&&i<len-3)dp(x-px*2,y-py*2,lc(colL,'#c0ffaa',0.3));}
                if(thick>2&&i>2&&i<len-4&&i%2===0){dp(x+px,y+py,col);dp(x-px,y-py,col);}
            }
        }
    }
    function palmTree(bx, by, h, lean, fl, ft) {
        const top = palmTrunk(bx, by, h, lean);
        dp(top.x-1,top.y+1,'#6a4418');dp(top.x,top.y+1,'#5a3810');dp(top.x+1,top.y+1,'#7a5020');dp(top.x,top.y+2,'#5a3810');
        for (const a of [-2.9,-2.5,-2.0,-1.5,-1.0,-0.5,-0.1,0.3]) palmFrond(top.x,top.y-1,a,fl+Math.floor(rand()*5-2),ft);
    }

    function broadTree(bx, by, trunkH, crx, cry, species) {
        const sp=SP[species]||SP.tropical, b=sp.bark;
        const shRx=Math.round(crx*1.1),shRy=Math.max(2,Math.round(cry*0.25)),shCx=bx+Math.round(crx*0.4),shCy=by+1;
        for(let dy=-shRy;dy<=shRy;dy++){const rh=Math.round(shRx*Math.sqrt(Math.max(0,1-(dy*dy)/(shRy*shRy))));for(let dx=-rh;dx<=rh;dx++){const d=Math.sqrt(dx*dx/(shRx*shRx)+dy*dy/(shRy*shRy));if(d>0.95)continue;dp(Math.max(0,Math.min(W-1,shCx+dx)),shCy+dy,lc('#2a6a1a','#357a20',d));}}
        for(let i=0;i<trunkH;i++){const y=by-i,ci=Math.floor(i/2)%b.length;for(let dx=-1;dx<=1;dx++)dp(bx+dx,y,lc(b[ci],'#0a0a04',(dx<=0?0:0.3)+Math.abs(dx)*0.15));if(Math.floor(i/2)%b.length===3)dp(bx-1,y,lc(b[ci],sp.hl,0.25));}
        const cx=bx,cy=by-trunkH-cry*0.4,LX=-0.65,LY=-0.75,ld=sp.ld||'#0e3e0e',ll=sp.ll||'#70d870';
        for(let dy=-cry;dy<=cry;dy++){const rh=Math.round(crx*Math.sqrt(Math.max(0,1-(dy*dy)/(cry*cry))));for(let dx=-rh;dx<=rh;dx++){const dist=Math.sqrt(dx*dx/(crx*crx)+dy*dy/(cry*cry));if(dist>0.96&&rand()>0.35)continue;const nx=dx/crx,ny=dy/cry,nz=Math.sqrt(Math.max(0,1-nx*nx-ny*ny));const lighting=Math.max(0,nx*LX+ny*LY+nz*0.5)*0.7+0.15;const n=(Math.sin(dx*3.3+dy*2.7)*0.5+0.5)*0.12+(Math.sin(dx*7.1-dy*5.3)*0.5+0.5)*0.08;const bg=lc(ld,ll,lighting+n);const cl2=Math.sin(dx*1.8+dy*2.2)*0.5+0.5;dp(cx+dx,cy+dy,cl2>0.7?lc(bg,'#88ee77',0.2):cl2<0.3?lc(bg,'#0a2a0a',0.15):bg);}}
        for(let i=0;i<Math.round(crx*1.5);i++){const a=-Math.PI*0.75+(rand()-0.5)*1.2,r=(0.4+rand()*0.45)*Math.min(crx,cry);dp(cx+Math.cos(a)*r,cy+Math.sin(a)*r,['#90ee70','#80dd60','#a0ff88'][Math.floor(rand()*3)]);}
        for(let i=0;i<Math.round(crx*1.2);i++){const a=Math.PI*0.25+(rand()-0.5)*1.2,r=(0.4+rand()*0.45)*Math.min(crx,cry);dp(cx+Math.cos(a)*r,cy+Math.sin(a)*r,['#1a4a18','#0e380e','#224e22'][Math.floor(rand()*3)]);}
        for(let a=0;a<Math.PI*2;a+=0.3){const er=0.9+rand()*0.2;dp(cx+Math.cos(a)*crx*er,cy+Math.sin(a)*cry*er,(Math.cos(a)*LX+Math.sin(a)*LY)>0?'#66cc55':'#2a6a28');}
        if(sp.fl){for(let i=0;i<Math.round(crx*2.2);i++){const a2=rand()*Math.PI*2,r2=rand()*Math.min(crx,cry)*0.85;const fx2=cx+Math.cos(a2)*r2,fy2=cy+Math.sin(a2)*r2;dp(fx2,fy2,sp.fl);dp(fx2+(rand()>0.5?1:-1),fy2,lc(sp.fl,'#ffffff',0.3));}}
    }

    function leafCluster(cx2,cy2,r,sp){
        const ld2=sp.ld||'#0e3e0e',ll2=sp.ll||'#70d870';
        for(let dy=-r;dy<=r;dy++){const rw=Math.round(r*Math.sqrt(Math.max(0,1-(dy*dy)/(r*r))));for(let dx=-rw;dx<=rw;dx++){const dist=Math.sqrt(dx*dx+dy*dy)/r;if(dist>0.92&&rand()>0.4)continue;const nx=dx/r,ny=dy/r,nz=Math.sqrt(Math.max(0,1-nx*nx-ny*ny));dp(cx2+dx,cy2+dy,lc(ld2,ll2,Math.max(0,nx*-0.65+ny*-0.75+nz*0.5)*0.65+0.2+(Math.sin(dx*4+dy*3)*0.5+0.5)*0.1));}}
        if(sp.fl){for(let i=0;i<Math.round(r*1.8);i++){const a=rand()*Math.PI*2,fr=rand()*r*0.8;dp(cx2+Math.cos(a)*fr,cy2+Math.sin(a)*fr,sp.fl);}}
    }
    function drawBranch(x,y,angle,len,thick,depth,sp){
        const b=sp.bark;
        for(let i=0;i<len;i++){const t=i/len;x+=Math.cos(angle);y+=Math.sin(angle);angle+=(rand()-0.5)*0.08;const ci=Math.floor(i/2)%b.length;const w=Math.max(0.5,thick*(1-t*0.6));for(let dx=-Math.ceil(w);dx<=Math.ceil(w);dx++){if(Math.abs(dx)>w)continue;dp(x+dx,y,lc(b[ci],'#0a0a04',Math.abs(dx)/Math.max(1,w)*0.4+(dx>0?0.2:0)));}}
        if(depth<=0){leafCluster(x,y-1,3+Math.floor(rand()*3),sp);return;}
        const forks=2+(rand()>0.6?1:0),spread=0.5+rand()*0.3;
        for(let f=0;f<forks;f++){drawBranch(x,y,angle+(f-(forks-1)/2)*spread+(rand()-0.5)*0.2,len*(0.55+rand()*0.15),thick*0.65,depth-1,sp);}
    }
    function branchTree(bx,by,trunkH,species){
        const sp=SP[species]||SP.silver,b=sp.bark;
        const shW=Math.round(trunkH*0.4);for(let dx=-shW;dx<=shW;dx++){const sd=Math.abs(dx)/shW;if(sd<0.9)dp(bx+dx+Math.round(shW*0.3),by+1,lc('#2a6a1a','#3a7a22',sd));}
        let tx=bx;const forkH=Math.round(trunkH*0.55);
        for(let i=0;i<forkH;i++){const y=by-i,ci=Math.floor(i/2)%b.length;const w=1.5-(i/forkH)*0.5;for(let dx=-Math.ceil(w);dx<=Math.ceil(w);dx++){if(Math.abs(dx)>w)continue;dp(tx+dx,y,lc(b[ci],'#0a0a04',Math.abs(dx)/Math.max(1,w)*0.35+(dx>0?0.2:0)));}if(Math.floor(i/2)%b.length===2)dp(tx-1,y,lc(b[ci],sp.hl,0.2));}
        const bc=3+Math.floor(rand()*2),topY=by-forkH;
        for(let i=0;i<bc;i++){drawBranch(tx,topY,-Math.PI/2+(i-(bc-1)/2)*0.55+(rand()-0.5)*0.25,(trunkH-forkH)*(0.5+rand()*0.3),1.2,2,sp);}
    }

    function bush(bx,by,rx,ry,species){
        const sp=SP[species]||SP.tropical,ld2=sp.ld||'#122e12',ll2=sp.ll||'#6ad06a',bcx=bx,bcy=by-ry;
        for(let dx=-rx;dx<=rx+2;dx++){const sd=Math.abs(dx)/(rx+2);if(sd<0.9)dp(bx+dx+1,by+1,lc('#2a6a1a','#3a7a22',sd));}
        for(let dy=-ry;dy<=ry;dy++){const rh=Math.round(rx*Math.sqrt(Math.max(0,1-(dy*dy)/(ry*ry))));for(let dx=-rh;dx<=rh;dx++){const dist=Math.sqrt(dx*dx/(rx*rx)+dy*dy/(ry*ry));if(dist>0.93&&rand()>0.4)continue;const nx=dx/rx,ny=dy/ry,nz=Math.sqrt(Math.max(0,1-nx*nx-ny*ny));dp(bcx+dx,bcy+dy,lc(ld2,ll2,Math.max(0,nx*-0.65+ny*-0.75+nz*0.5)*0.6+0.2+(Math.sin(dx*4.1+dy*3.3)*0.5+0.5)*0.12));}}
        if(sp.fl){for(let i=0;i<Math.round(rx*1.5);i++){const a=rand()*Math.PI*2,r2=rand()*rx*0.7;dp(bcx+Math.cos(a)*r2,bcy+Math.sin(a)*r2,sp.fl);}}
    }
    function flower(x,y,c){dp(x,y-3,c);dp(x-1,y-2,c);dp(x,y-2,'#ffee55');dp(x+1,y-2,c);dp(x,y-1,c);dp(x,y,'#338833');dp(x,y+1,'#2d7a2d');}
    function fern(x,y){dp(x,y,'#4ab84a');dp(x-1,y-1,'#5ac85a');dp(x+1,y-1,'#5ac85a');dp(x,y-1,'#3ca03c');dp(x-2,y-2,'#6ad86a');dp(x+2,y-2,'#6ad86a');dp(x,y-2,'#4ab84a');dp(x-1,y-3,'#78e078');dp(x+1,y-3,'#78e078');dp(x,y-3,'#5ad35a');dp(x,y-4,'#88ee88');}

    function santaFeSign(bx, by) {
        function fp(x, y, c) { dp(bx + x, by + y, c); }
        function letter(lx, c, rows) {
            for (let r = 0; r < rows.length; r++) {
                const row = rows[r];
                const ci = r < 3 ? 0 : r < 6 ? 1 : 2;
                for (let i = 0; i < row.length; i += 2) {
                    for (let x = row[i]; x <= row[i+1]; x++) fp(lx+x, -11+r, c[ci]);
                }
            }
        }
        letter(0, ['#44bb44','#66cc22','#22aa66'], [[1,5],[0,5],[0,1],[0,4],[2,5],[4,5],[0,1,4,5],[0,5],[1,4]]);
        letter(8, ['#ff4422','#ff8800','#ffcc00'], [[2,4],[1,5],[0,1,5,6],[0,6],[0,6],[0,6],[0,1,5,6],[0,1,5,6],[0,1,5,6]]);
        letter(16, ['#2288ff','#44bbff','#22ddaa'], [[0,1,5,6],[0,2,5,6],[0,1,2,3,5,6],[0,1,3,4,5,6],[0,1,4,5,6],[0,1,5,6],[0,1,5,6],[0,1,5,6],[0,1,5,6]]);
        letter(24, ['#dd44dd','#ff66aa','#ffaa44'], [[0,8],[0,8],[3,5],[3,5],[3,5],[3,5],[3,5],[3,5],[3,5]]);
        letter(34, ['#ffcc00','#ff6622','#44cc44'], [[2,4],[1,5],[0,1,5,6],[0,6],[0,6],[0,6],[0,1,5,6],[0,1,5,6],[0,1,5,6]]);
        letter(45, ['#22cc88','#44aadd','#2266ff'], [[0,5],[0,5],[0,1],[0,4],[0,4],[0,1],[0,1],[0,1],[0,1]]);
        letter(52, ['#ff4444','#ff8844','#ffdd22'], [[0,5],[0,5],[0,1],[0,4],[0,4],[0,1],[0,1],[0,5],[0,5]]);
        const totalW = 58;
        for (let dx = -1; dx <= totalW; dx++) { fp(dx, -1, '#f8f8f8'); fp(dx, 0, '#eeeeee'); fp(dx, 1, '#d8d8d8'); }
    }

    function smallHouse(bx,by,wC,wD,rC,rD,dC){
        const hw=3,wallH=4,roofH=3;
        for(let dx=-hw-1;dx<=hw+2;dx++)dp(bx+dx,by+1,lc('#2a6a1a','#3a7a22',Math.abs(dx)/(hw+2)));
        for(let dy=0;dy<wallH;dy++)for(let dx=-hw;dx<=hw;dx++)dp(bx+dx,by-dy,dx<=0?wC:wD);
        for(let dy=0;dy<roofH;dy++){const rw=hw+1-Math.floor(dy*(hw+2)/roofH);for(let dx=-rw;dx<=rw;dx++)dp(bx+dx,by-wallH-dy,dx<=0?rC:rD);}
        dp(bx,by-wallH-roofH+1,lc(rC,'#ffffff',0.2));
        for(let dy=0;dy<2;dy++){dp(bx,by-dy,dC);dp(bx+1,by-dy,lc(dC,'#0a0a0a',0.15));}
        dp(bx-2,by-Math.floor(wallH*0.45),'#88ccff');dp(bx-2,by-Math.floor(wallH*0.45)-1,'#99ddff');
        for(let dx=-hw;dx<=hw;dx++)dp(bx+dx,by-wallH+1,lc(dx<=0?wC:wD,'#0a0a0a',0.2));
    }
    function house(bx,by,wC,wD,rC,rD,dC,sz){
        const hw=sz==='l'?7:5,wallH=sz==='l'?8:6,roofH=sz==='l'?6:4;
        for(let dx=-hw-1;dx<=hw+3;dx++)dp(bx+dx,by+1,lc('#2a6a1a','#3a7a22',Math.abs(dx)/(hw+3)));
        for(let dy=0;dy<wallH;dy++)for(let dx=-hw;dx<=hw;dx++)dp(bx+dx,by-dy,dx<=0?wC:wD);
        for(let dy=0;dy<roofH;dy++){const rw=hw+1-Math.floor(dy*(hw+2)/roofH);for(let dx=-rw;dx<=rw;dx++)dp(bx+dx,by-wallH-dy,dx<=0?rC:rD);}
        dp(bx,by-wallH-roofH+1,lc(rC,'#ffffff',0.2));
        const dh=sz==='l'?4:3;for(let dy=0;dy<dh;dy++){dp(bx,by-dy,dC);dp(bx+1,by-dy,lc(dC,'#0a0a0a',0.15));}dp(bx+1,by-1,'#ccaa44');
        const wy=by-Math.floor(wallH*0.45);
        if(sz==='l'){dp(bx-4,wy,'#88ccff');dp(bx-3,wy,'#aaddff');dp(bx-4,wy-1,'#99ddff');dp(bx-3,wy-1,'#bbddff');dp(bx+3,wy,'#556688');dp(bx+4,wy,'#4a5a77');dp(bx+3,wy-1,'#667799');dp(bx+4,wy-1,'#556688');}
        else{dp(bx-3,wy,'#88ccff');dp(bx-2,wy,'#aaddff');dp(bx-3,wy-1,'#99ddff');dp(bx-2,wy-1,'#bbddff');}
        for(let dx=-hw;dx<=hw;dx++)dp(bx+dx,by-wallH+1,lc(dx<=0?wC:wD,'#0a0a0a',0.2));
    }

    function person(x,y,sk,sh,pa,hatC,dir,frame){
        const skDk=lc(sk,'#000000',0.2),shDk=lc(sh,'#000000',0.25),shHl=lc(sh,'#ffffff',0.2),paDk=lc(pa,'#000000',0.2);
        const step=frame%4;
        if(hatC==='none'){dp(x,y,sk);dp(x+1,y,sk);dp(x,y+1,skDk);dp(x+1,y+1,skDk);}
        else{const hDk=lc(hatC,'#000000',0.15);dp(x-2,y+1,hatC);dp(x-1,y+1,hatC);dp(x,y+1,hatC);dp(x+1,y+1,hatC);dp(x+2,y+1,hatC);dp(x+3,y+1,hatC);dp(x-1,y,hatC);dp(x,y,hDk);dp(x+1,y,hDk);dp(x+2,y,hatC);dp(x,y-1,hatC);dp(x+1,y-1,hatC);}
        dp(x-1,y+2,sk);dp(x,y+2,sk);dp(x+1,y+2,sk);dp(x+2,y+2,skDk);dp(x,y+3,sk);dp(x+1,y+3,sk);
        dp(x,y+4,skDk);dp(x+1,y+4,skDk);
        dp(x-1,y+5,shHl);dp(x,y+5,sh);dp(x+1,y+5,sh);dp(x+2,y+5,shDk);dp(x-1,y+6,shHl);dp(x,y+6,sh);dp(x+1,y+6,sh);dp(x+2,y+6,shDk);dp(x,y+7,sh);dp(x+1,y+7,shDk);
        if(step<2){dp(x-2,y+5,sk);dp(x-2,y+6,sk);dp(x+3,y+6,sk);dp(x+3,y+7,sk);}else{dp(x-2,y+6,sk);dp(x-2,y+7,sk);dp(x+3,y+5,sk);dp(x+3,y+6,sk);}
        dp(x-1,y+8,paDk);dp(x,y+8,pa);dp(x+1,y+8,pa);dp(x+2,y+8,paDk);
        if(step===0){dp(x-1,y+9,pa);dp(x,y+9,pa);dp(x+1,y+9,pa);dp(x+2,y+9,paDk);dp(x-1,y+10,pa);dp(x+2,y+10,paDk);dp(x-1,y+11,'#2a1a10');dp(x+2,y+11,'#1a0e08');}
        else if(step===1){dp(x,y+9,pa);dp(x+1,y+9,pa);dp(x-1,y+10,pa);dp(x+2,y+10,paDk);dp(x-1,y+11,'#2a1a10');dp(x+2,y+11,'#1a0e08');dp(x-2,y+11,'#2a1a10');}
        else if(step===2){dp(x-1,y+9,pa);dp(x,y+9,pa);dp(x+1,y+9,pa);dp(x+2,y+9,paDk);dp(x-1,y+10,paDk);dp(x+2,y+10,pa);dp(x-1,y+11,'#1a0e08');dp(x+2,y+11,'#2a1a10');}
        else{dp(x,y+9,pa);dp(x+1,y+9,pa);dp(x-1,y+10,paDk);dp(x+2,y+10,pa);dp(x-1,y+11,'#1a0e08');dp(x+2,y+11,'#2a1a10');dp(x+3,y+11,'#2a1a10');}
    }

    function drawHorse(x, y, dir, frame, bodyC, maneC) {
        const bd = lc(bodyC,'#000000',0.18), bh = lc(bodyC,'#ffffff',0.15);
        const md = lc(maneC,'#000000',0.2), mh = lc(maneC,'#ffffff',0.2);
        const step = frame % 4;
        const d = dir;
        for (let dx = -5; dx <= 5; dx++) { dp(x+dx, y, dx*d > 0 ? bh : bodyC); dp(x+dx, y+1, bodyC); }
        for (let dx = -5; dx <= 5; dx++) dp(x+dx, y+2, bodyC);
        for (let dx = -4; dx <= 4; dx++) dp(x+dx, y+3, bodyC);
        for (let dx = -4; dx <= 4; dx++) dp(x+dx, y-1, dx*d > 2 ? bh : bodyC);
        dp(x-1, y+3, bh); dp(x, y+3, bh); dp(x+1, y+3, bh);
        dp(x+5*d, y-1, bodyC); dp(x+5*d, y-2, bodyC);
        dp(x+6*d, y-1, bd);   dp(x+6*d, y-2, bodyC); dp(x+6*d, y-3, bodyC);
        dp(x+7*d, y-2, bd);   dp(x+7*d, y-3, bodyC); dp(x+7*d, y-4, bodyC);
        dp(x+8*d, y-5, bodyC); dp(x+9*d, y-5, bodyC); dp(x+10*d, y-5, bh);
        dp(x+8*d, y-4, bodyC); dp(x+9*d, y-4, bodyC); dp(x+10*d, y-4, bodyC);
        dp(x+8*d, y-3, bd); dp(x+9*d, y-3, bodyC); dp(x+10*d, y-3, bd);
        dp(x+11*d, y-4, lc(bodyC,'#d8c0a0',0.3));
        dp(x+11*d, y-3, lc(bodyC,'#d8c0a0',0.4));
        dp(x+9*d, y-6, bodyC); dp(x+10*d, y-6, bd);
        dp(x+10*d, y-5, '#1a1008');
        dp(x+11*d, y-3, '#2a1a10');
        dp(x+5*d, y-2, maneC); dp(x+6*d, y-3, maneC); dp(x+7*d, y-4, maneC);
        dp(x+8*d, y-5, maneC); dp(x+4*d, y-1, maneC); dp(x+5*d, y-1, md);
        dp(x-5*d, y, maneC); dp(x-6*d, y+1, maneC);
        dp(x-6*d, y+2, md);
        if (step > 1) dp(x-6*d, y+3, md);
        const legC = bd, hoofC = '#1a1008';
        if (step === 0) {
            dp(x+4*d,y+4,legC); dp(x+4*d,y+5,legC); dp(x+4*d,y+6,legC); dp(x+4*d,y+7,hoofC);
            dp(x+2*d,y+4,legC); dp(x+2*d,y+5,legC); dp(x+2*d,y+6,legC); dp(x+2*d,y+7,hoofC);
            dp(x-2*d,y+4,legC); dp(x-2*d,y+5,legC); dp(x-2*d,y+6,legC); dp(x-2*d,y+7,hoofC);
            dp(x-4*d,y+4,legC); dp(x-4*d,y+5,legC); dp(x-4*d,y+6,legC); dp(x-4*d,y+7,hoofC);
        } else if (step === 1) {
            dp(x+4*d,y+4,legC); dp(x+5*d,y+5,legC); dp(x+5*d,y+6,legC); dp(x+5*d,y+7,hoofC);
            dp(x+2*d,y+4,legC); dp(x+2*d,y+5,legC); dp(x+2*d,y+6,legC); dp(x+2*d,y+7,hoofC);
            dp(x-2*d,y+4,legC); dp(x-2*d,y+5,legC); dp(x-2*d,y+6,legC); dp(x-2*d,y+7,hoofC);
            dp(x-4*d,y+4,legC); dp(x-5*d,y+5,legC); dp(x-5*d,y+6,legC); dp(x-5*d,y+7,hoofC);
        } else if (step === 2) {
            dp(x+4*d,y+4,legC); dp(x+4*d,y+5,legC); dp(x+4*d,y+6,legC); dp(x+4*d,y+7,hoofC);
            dp(x+2*d,y+4,legC); dp(x+3*d,y+5,legC); dp(x+3*d,y+6,legC); dp(x+3*d,y+7,hoofC);
            dp(x-2*d,y+4,legC); dp(x-3*d,y+5,legC); dp(x-3*d,y+6,legC); dp(x-3*d,y+7,hoofC);
            dp(x-4*d,y+4,legC); dp(x-4*d,y+5,legC); dp(x-4*d,y+6,legC); dp(x-4*d,y+7,hoofC);
        } else {
            dp(x+4*d,y+4,legC); dp(x+3*d,y+5,legC); dp(x+3*d,y+6,legC); dp(x+3*d,y+7,hoofC);
            dp(x+2*d,y+4,legC); dp(x+2*d,y+5,legC); dp(x+2*d,y+6,legC); dp(x+2*d,y+7,hoofC);
            dp(x-2*d,y+4,legC); dp(x-2*d,y+5,legC); dp(x-2*d,y+6,legC); dp(x-2*d,y+7,hoofC);
            dp(x-4*d,y+4,legC); dp(x-3*d,y+5,legC); dp(x-3*d,y+6,legC); dp(x-3*d,y+7,hoofC);
        }
    }

    function g(xPct) { return gnd[Math.max(0, Math.min(W-1, Math.round(xPct * W)))]; }
    function gx(xPct) { return Math.round(xPct * W); }

    const skyCvs = document.createElement('canvas');
    skyCvs.width = W; skyCvs.height = H;
    _ctx = skyCvs.getContext('2d');
    drawSky();

    const mtnCvs = document.createElement('canvas');
    mtnCvs.width = W; mtnCvs.height = H;
    _ctx = mtnCvs.getContext('2d');
    drawMountains(); drawGround(); drawStaticClouds();

    function renderVegetation(seed) {
        const off = document.createElement('canvas');
        off.width = W; off.height = H;
        const oc = off.getContext('2d');
        _ctx = oc; _seed = seed;

        broadTree(gx(.125),g(.125)+1,sy(38),sx(14),sy(16),'tropical');
        branchTree(gx(.50),g(.50)+1,sy(30),'jacaranda');
        branchTree(gx(.375),g(.375)+1,sy(26),'silver');
        palmTree(gx(.23),g(.23)+1,sy(52),-0.4,sy(18),1);
        palmTree(gx(.44),g(.44)+1,sy(28),0.3,sy(11),1);
        branchTree(gx(.56),g(.56)+1,sy(22),'cherry');

        broadTree(gx(.075),g(.075)+1,sy(42),sx(15),sy(18),'mahogany');
        branchTree(gx(.29),g(.29)+1,sy(34),'flamboyant');
        broadTree(gx(.58),g(.58)+1,sy(36),sx(14),sy(16),'jacaranda');
        branchTree(gx(.46),g(.46)+1,sy(36),'cherry');
        palmTree(gx(.175),g(.175)+1,sy(62),-0.6,sy(22),2);
        palmTree(gx(.40),g(.40)+1,sy(34),-0.3,sy(14),2);
        branchTree(gx(.625),g(.625)+1,sy(24),'jacaranda');

        palmTree(gx(.05),g(.05)+2,sy(82),-0.7,sy(26),3);
        broadTree(gx(.21),g(.21)+1,sy(46),sx(16),sy(18),'flamboyant');
        branchTree(gx(.33),g(.33)+1,sy(42),'silver');
        palmTree(gx(.65),g(.65)+1,sy(72),0.45,sy(24),3);
        branchTree(gx(.25),g(.25)+1,sy(38),'birch');

        house(gx(.45),g(.45),'#e8d8b8','#c4b498','#b85533','#8a3a22','#5a3a20','l');
        house(gx(.575),g(.575),'#f0ece0','#d0c8b8','#5a7a8a','#3e5a66','#4a3828','s');

        palmTree(gx(.49),g(.49)+1,sy(58),-0.25,sy(20),2);
        palmTree(gx(.53),g(.53)+1,sy(52),0.2,sy(18),2);

        const pBase = Math.round(g(.80) - sy(12));
        smallHouse(gx(.77),pBase-sy(15),'#e8dcc8','#c8bc9c','#6a5040','#4a3828','#3a2818');
        smallHouse(gx(.83),pBase-sy(16),'#f0e8d8','#d4ccb8','#b04020','#882e18','#5a3a20');
        house(gx(.75),pBase-sy(8),'#e8dcc8','#c8bc9c','#6a5040','#4a3828','#3a2818','s');
        house(gx(.80),pBase-sy(9),'#f0ece0','#d0c8b8','#b85533','#8a3a22','#5a3a20','s');
        house(gx(.85),pBase-sy(8),'#ddd0b8','#c0b498','#5a7a8a','#3e5a66','#4a3828','s');
        house(gx(.90),pBase-sy(9),'#e8d8b8','#c4b498','#a04828','#7a3420','#4a3020','s');
        house(gx(.73),pBase,'#e8d8b8','#c4b498','#b85533','#8a3a22','#5a3a20','l');
        house(gx(.79),pBase-sy(1),'#f0ece0','#d0c8b8','#5a7a8a','#3e5a66','#4a3828','s');
        house(gx(.84),pBase,'#ddd0b8','#c0b498','#a04828','#7a3420','#4a3020','l');
        house(gx(.89),pBase-sy(1),'#f0e8d8','#d4ccb8','#b04020','#882e18','#5a3a20','s');

        palmTree(gx(.71),g(.71)+1,sy(40),0.3,sy(14),2);
        palmTree(gx(.91),g(.91)+1,sy(44),-0.3,sy(16),2);

        santaFeSign(gx(.72), g(.80)-sy(3));

        bush(gx(.10),g(.10),sx(8),sy(5),'tropical'); bush(gx(.21),g(.21),sx(6),sy(4),'cherry'); bush(gx(.30),g(.30),sx(7),sy(5),'tropical');
        bush(gx(.40),g(.40),sx(5),sy(3),'jacaranda'); bush(gx(.60),g(.60),sx(5),sy(3),'flamboyant');
        bush(gx(.15),g(.15),sx(4),sy(3),'flamboyant'); bush(gx(.25),g(.25),sx(3),sy(2),'tropical');
        bush(gx(.54),g(.54),sx(3),sy(2),'jacaranda');

        fern(gx(.17),g(.17)-1);fern(gx(.27),g(.27)-1);fern(gx(.37),g(.37)-1);fern(gx(.44),g(.44)-1);
        fern(gx(.56),g(.56)-1);fern(gx(.63),g(.63)-1);
        flower(gx(.20),g(.20)-1,'#ff6699');flower(gx(.33),g(.33)-1,'#ff8844');flower(gx(.49),g(.49)-1,'#ff6699');
        flower(gx(.67),g(.67)-1,'#ffaa44');flower(gx(.58),g(.58)-1,'#ff8844');

        return off;
    }

    let currentSeed = Math.floor(Math.random() * 99999);
    let sceneA = renderVegetation(currentSeed);

    const people = [
        {x:-10,speed:0.58,skin:'#d4a574',shirt:'#cc4444',pants:'#4466aa',hat:'#e8d8b0',dir:1,frame:0},
        {x:W+10,speed:0.50,skin:'#c69060',shirt:'#4488cc',pants:'#886644',hat:'none',dir:-1,frame:7},
        {x:W*0.3,speed:0.46,skin:'#b8845a',shirt:'#55aa55',pants:'#555577',hat:'#3a2818',dir:1,frame:3},
        {x:W*0.7,speed:0.52,skin:'#ddb088',shirt:'#dd7733',pants:'#445566',hat:'#ddd0aa',dir:-1,frame:11},
        {x:W*0.15,speed:0.44,skin:'#c49868',shirt:'#8855aa',pants:'#667744',hat:'none',dir:1,frame:5},
        {x:W*0.85,speed:0.42,skin:'#d4a070',shirt:'#cc6688',pants:'#4a6688',hat:'#2a1a0e',dir:-1,frame:9},
    ];
    const horses = [
        {x:W*0.5, speed:0.42, dir:-1, frame:0, body:'#8B6914', mane:'#2a1a08'},
    ];
    const animClouds = [
        {x:sx(20),y:sy(12),rx:sx(10),ry:sy(2),speed:0.18},
        {x:sx(80),y:sy(6),rx:sx(14),ry:sy(3),speed:0.14},
        {x:sx(150),y:sy(20),rx:sx(8),ry:sy(2),speed:0.16},
        {x:sx(210),y:sy(9),rx:sx(11),ry:sy(3),speed:0.12},
        {x:sx(55),y:sy(26),rx:sx(7),ry:sy(2),speed:0.15},
        {x:sx(180),y:sy(4),rx:sx(9),ry:sy(2),speed:0.13},
    ];
    for (const cl of animClouds) cl.sprite = preRenderCloud(cl.rx, cl.ry);

    const CYCLE = 1320;
    let dayFrame = 0;

    const stars = [];
    for (let i = 0; i < 90; i++) stars.push({ x: Math.floor(Math.random()*W), y: Math.floor(Math.random()*Math.round(H*0.28)), b: 0.5+Math.random()*0.5, tw: Math.random()*Math.PI*2, c: '#ffffff' });
    stars.push({ x: Math.round(W*0.85), y: Math.round(H*0.12), b: 0.9, tw: 1.2, c: '#ffbbaa' });

    function celestialArc(t) {
        const angle = Math.PI * t;
        return { x: W*0.5 + Math.cos(angle)*W*0.4, y: H*0.55 - Math.sin(angle)*H*0.48 };
    }

    function drawSun(cx, cy) {
        const r = Math.max(3, sx(5));
        for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
            const d = Math.sqrt(dx*dx+dy*dy);
            if (d <= r) dp(cx+dx, cy+dy, d < r*0.5 ? '#fff8e0' : d < r*0.75 ? '#ffdd44' : '#ffaa22');
        }
        for (let i = 0; i < 8; i++) {
            const a = i*Math.PI/4, rl = r+2;
            for (let j = 0; j < 3; j++) { const rr = rl+j; dp(cx+Math.cos(a)*rr, cy+Math.sin(a)*rr, j===0?'#ffcc33':'#ffaa22'); }
        }
    }
    function drawMoon(cx, cy) {
        const r = Math.max(3, sx(4));
        for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
            const d = Math.sqrt(dx*dx+dy*dy);
            if (d > r) continue;
            const cutD = Math.sqrt((dx-r*0.4)*(dx-r*0.4)+(dy-r*-0.3)*(dy-r*-0.3));
            if (cutD < r*0.75) continue;
            dp(cx+dx, cy+dy, d < r*0.5 ? '#ffffff' : '#f4f4f0');
        }
    }
    function drawStars(alpha, frame) {
        for (const s of stars) {
            const twinkle = 0.65 + 0.35*Math.sin(frame*0.06 + s.tw);
            const a = alpha * (0.7 + s.b*0.3) * twinkle;
            if (a < 0.05) continue;
            dp(s.x, s.y, s.c || '#ffffff');
        }
    }

    function getDayOverlay(t) {
        if (t < 0.08) { const p = t/0.08; return { color: lc('#0a0830','#ff8844',p), alpha: lerp(0.55,0.12,p) }; }
        if (t < 0.15) { const p = (t-0.08)/0.07; return { color: '#ff8844', alpha: lerp(0.12,0,p) }; }
        if (t < 0.42) return { color: '#000000', alpha: 0 };
        if (t < 0.52) { const p = (t-0.42)/0.10; return { color: lc('#ff8844','#cc4488',p), alpha: lerp(0,0.2,p) }; }
        if (t < 0.58) { const p = (t-0.52)/0.06; return { color: lc('#cc4488','#0a0830',p), alpha: lerp(0.2,0.45,p) }; }
        { const p = Math.min(1,(t-0.58)/0.12); return { color: '#0a0830', alpha: lerp(0.45,0.65,p) }; }
    }

    let running = true;
    let lastFrameTime = 0;
    const FRAME_INTERVAL = 1000 / 30;
    const STEP = 2;

    function animate(timestamp) {
        if (!running || !cvs.isConnected) { running = false; return; }
        _forestAnim = requestAnimationFrame(animate);

        const elapsed = timestamp - lastFrameTime;
        if (elapsed < FRAME_INTERVAL) return;
        lastFrameTime = timestamp - (elapsed % FRAME_INTERVAL);

        dayFrame = (dayFrame + STEP) % CYCLE;
        const dayT = dayFrame / CYCLE;

        _ctx = rCtx;

        rCtx.drawImage(skyCvs, 0, 0);

        if (dayT < 0.55) {
            const pos = celestialArc(dayT / 0.55);
            drawSun(Math.round(pos.x), Math.round(pos.y));
        } else {
            const mt = (dayT - 0.55) / 0.45;
            const starAlpha = mt < 0.15 ? 0 : mt < 0.59 ? (mt-0.15)/0.44 : mt > 0.70 ? (1-mt)/0.30 : 1;
            drawStars(starAlpha, dayFrame);
            const pos = celestialArc(mt);
            drawMoon(Math.round(pos.x), Math.round(pos.y));
        }

        rCtx.drawImage(mtnCvs, 0, 0);
        rCtx.drawImage(sceneA, 0, 0);

        for (const cl of animClouds) {
            cl.x += cl.speed * STEP;
            if (cl.x > W + cl.rx + 10) cl.x = -cl.rx - 10;
            rCtx.drawImage(cl.sprite, Math.round(cl.x-cl.rx-2), Math.round(cl.y-cl.ry-2));
        }

        const nightAlpha = dayT >= 0.55 ? Math.min(1, ((dayT-0.55)/0.45) < 0.2 ? ((dayT-0.55)/0.45)/0.2 : ((dayT-0.55)/0.45) > 0.85 ? (1-((dayT-0.55)/0.45))/0.15 : 1) : 0;
        for (const p of people) {
            p.x += p.speed * p.dir * STEP;
            p.frame += STEP;
            if (p.dir > 0 && p.x > W+10) p.x = -10;
            if (p.dir < 0 && p.x < -10) p.x = W+10;
            const gIdx = Math.max(0, Math.min(W-1, Math.round(p.x)));
            const py = gnd[gIdx]-8;
            if (nightAlpha > 0.05) {
                const px = Math.round(p.x);
                const flCx = px + p.dir * 2;
                const flCy = py + 5;
                rCtx.globalAlpha = nightAlpha * 0.45;
                rCtx.fillStyle = '#ffffcc';
                for (let row = 1; row <= 10; row++) {
                    const yOff = Math.ceil(row * 0.5);
                    const w = Math.ceil(row * 0.45);
                    for (let dx = -w; dx <= w; dx++) {
                        if (row > 8 - dx * p.dir * 0.8) continue;
                        const fx = flCx + p.dir * row + dx;
                        const fy = flCy + yOff;
                        if (fx >= 0 && fx < W && fy >= 0 && fy < H)
                            rCtx.fillRect(fx, fy, 1, 1);
                    }
                }
                rCtx.globalAlpha = 1;
            }
            person(Math.round(p.x), py, p.skin, p.shirt, p.pants, p.hat, p.dir, Math.floor(p.frame/12));
        }

        for (const h of horses) {
            h.x += h.speed * h.dir * STEP;
            h.frame += STEP;
            if (h.dir > 0 && h.x > W+10) h.x = -10;
            if (h.dir < 0 && h.x < -10) h.x = W+10;
            const gIdx = Math.max(0, Math.min(W-1, Math.round(h.x)));
            const hy = gnd[gIdx]-3;
            drawHorse(Math.round(h.x), hy, h.dir, Math.floor(h.frame/8), h.body, h.mane);
        }

        const ov = getDayOverlay(dayT);
        if (ov.alpha > 0.005) {
            rCtx.globalAlpha = ov.alpha;
            rCtx.fillStyle = ov.color;
            rCtx.fillRect(0, 0, W, H);
            rCtx.globalAlpha = 1;
        }

        ctx.drawImage(renderCvs, 0, 0, displayW, displayH);

        const nightDepth = ov.alpha > 0.1 ? ov.alpha : 0;
        const canvasOp = 0.80 + nightDepth * 0.20;
        cvs.style.opacity = canvasOp.toFixed(3);

        if (!_fadeMask) {
            const fd = document.getElementById('pixel-forest-fade');
            if (fd) {
                const pw = 3, tw = 600, cols = tw / pw;
                let rects = '';
                let s = 7919;
                for (let i = 0; i < cols; i++) {
                    s = (s * 16807 + 13) % 2147483647;
                    const h = 95 + (s % 6);
                    rects += `<rect x='${i*pw}' width='${pw}' height='${h}' fill='white'/>`;
                }
                const svg = `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 ${tw} 100' preserveAspectRatio='none'>${rects}</svg>`;
                const url = `url("data:image/svg+xml,${encodeURIComponent(svg)}")`;
                fd.style.maskImage = url;
                fd.style.webkitMaskImage = url;
                fd.style.maskSize = `${tw}px 100%`;
                fd.style.webkitMaskSize = `${tw}px 100%`;
                fd.style.maskRepeat = 'repeat-x';
                fd.style.webkitMaskRepeat = 'repeat-x';
                _fadeMask = true;
            }
        }
        const fd = document.getElementById('pixel-forest-fade');
        if (fd && dayFrame % 6 === 0) {
            let gr = 53, gg = 128, gb = 26;
            if (ov.alpha > 0) {
                const h = ov.color;
                const ovR = parseInt(h.slice(1,3),16), ovG = parseInt(h.slice(3,5),16), ovB = parseInt(h.slice(5,7),16);
                gr = Math.round(gr + (ovR - gr) * ov.alpha);
                gg = Math.round(gg + (ovG - gg) * ov.alpha);
                gb = Math.round(gb + (ovB - gb) * ov.alpha);
            }
            fd.style.background = `rgba(${gr},${gg},${gb},${canvasOp.toFixed(3)})`;
        }

        if (dayFrame % 6 === 0) {
            let n;
            if (dayT < 0.01) n = 1;
            else if (dayT < 0.03) n = 1 - (dayT - 0.01) / 0.02;
            else if (dayT < 0.50) n = 0;
            else if (dayT < 0.52) n = (dayT - 0.50) / 0.02;
            else n = 1;
            n = Math.max(0, Math.min(1, n));
            const ht = document.getElementById('hero-title');
            const hs = document.getElementById('hero-subtitle');
            const hb = document.getElementById('hero-body');
            if (ht) {
                const titleR = Math.round(50 + 205*n), titleG = Math.round(55 + 200*n), titleB = Math.round(65 + 190*n);
                const subR = Math.round(95 + 160*n), subG = Math.round(100 + 155*n), subB = Math.round(115 + 140*n);
                ht.style.color = `rgb(${titleR},${titleG},${titleB})`;
                ht.style.textShadow = `0 1px ${Math.round(3 + n * 5)}px rgba(255,255,255,${(0.05 + n * 0.2).toFixed(2)})`;
                if (hs) {
                    hs.style.color = `rgb(${subR},${subG},${subB})`;
                    hs.style.textShadow = `0 1px ${Math.round(2 + n * 4)}px rgba(255,255,255,${(0.04 + n * 0.15).toFixed(2)})`;
                }
                if (hb) hb.style.color = `rgb(${subR},${subG},${subB})`;
            }
            const cards = document.querySelectorAll('.hero-card');
            const nums = document.querySelectorAll('.hero-card-num');
            const labels = document.querySelectorAll('.hero-card-label');
            const cardAlpha = (0.70 - n * 0.45).toFixed(2);
            cards.forEach(c => { c.style.background = `rgba(255,255,255,${cardAlpha})`; });
            nums.forEach((el, i) => { if (i === 1) return; const nr = Math.round(20+235*n), ng = Math.round(24+231*n), nb = Math.round(36+219*n); el.style.color = `rgb(${nr},${ng},${nb})`; });
            labels.forEach(el => { const lR = Math.round(156 + 99*n), lG = Math.round(163 + 92*n), lB = Math.round(175 + 80*n); el.style.color = `rgb(${lR},${lG},${lB})`; });
        }

        // no-op (kept for compatibility)
    }
    _forestAnim = requestAnimationFrame(animate);
    _forestCleanup = () => { running = false; if (_forestAnim) cancelAnimationFrame(_forestAnim); };
}

export function destroyForest() {
    if (_forestCleanup) _forestCleanup();
    _forestCleanup = null;
    _forestAnim = null;
    _fadeMask = false;
    const el = document.getElementById('pixel-forest');
    if (el) el._forestInit = false;
}

let _resizeTimer = null;
window.addEventListener('resize', () => {
    clearTimeout(_resizeTimer);
    _resizeTimer = setTimeout(() => {
        const el = document.getElementById('pixel-forest');
        if (el && el._forestInit) {
            destroyForest();
            initForest();
        }
    }, 300);
});
