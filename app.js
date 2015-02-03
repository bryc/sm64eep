window.addEventListener("load", function()
{
    "use strict";
    var Eeprom, Editor, File;
    
    function EepromHandler()
    {
        var _ref = this;

        function init()
        {
            for(var i = 0, dat = []; i < 10; i++)
            {
                var s    = (i < 8) ? 56 : 32,
                    m    = (i < 8) ? 0x4441 : 0x4849,
                    slot = [].slice.apply(new Uint8Array(s)),
                    len  = slot.length,
                    t    = len-2,
                    sum = 0;
                slot[len-4] = m   >> 8; slot[len-3] = m   & 0xFF;
                while(t--){sum+=slot[t];}
                slot[len-2] = sum >> 8; slot[len-1] = sum & 0xFF;
                dat = dat.concat(slot);
            }
            _ref.data = dat;
        }

        function updateHex()
        {
            for(var i = 0, t = ""; i < _ref.data.length; i++)
            {
                var digit = ("00" + _ref.data[i].toString(16)).slice(-2).toUpperCase();
                if(i!==0 && i%16==15) { t += digit + "<br>"; }
                else { t += digit + " "; }
                Editor.grab("#out2").innerHTML = t;
            }
        }
        
        function dupeCheck(offset, size, data)
        {
            var total = 0, i;  
            for(i = offset; i < offset + size; i++)
            {
                total += (data[i] === data[i + size]) ? 1 : 0;
            }
            return total;
        }
        
        function sumCheck(offset, size, data)
        {
            var checksum = 0, i;
            for(i = offset; i < offset + size; i++)
            {
                checksum = checksum + data[i];
            }
            return checksum;
        }
        
        function check(data)
        {
            var i, b, checkValue = 0;
            for(i = 0, b = 0; i < 512; i+= 112, b += 3)
            {
                var size      = (i >= 448) ? 32 : 56; // todo
                var magic0    = (i >= 448) ? 0x4849 : 0x4441;
                var magic1    = (data[i + size - 4] << 8) + data[i + size - 3];
                var checksum1 = (data[i + size - 2] << 8) + data[i + size - 1];
                var checksum0 = sumCheck(i, size - 2, data);
                var dupeChck = dupeCheck(i, size, data);
                var dsm = (magic0 >> 8) + magic0 & 0xFF;
                var c1 = (magic1 === magic0);
                var c2 = (checksum1 === checksum0) && (checksum0 >= dsm);
                var c3 = (dupeChck === size);
                checkValue |= (c1 << 0 + b) + (c2 << 1 + b) + (c3 << 2 + b);
            }
            return checkValue;
        }
        
        function doUpdate()
        {
            var md = this.metadata;
            var size = (md.glob === true) ? 32 : 56;
            var addr = Editor.addr;
            if(md.type === "num")
            {
                _ref.data[       addr + md.offset] = parseInt(this.value & 0xFF, 10);
                _ref.data[size + addr + md.offset] = parseInt(this.value & 0xFF, 10);
            }
            
            var sum = sumCheck(addr, size-2, _ref.data);
            var sum2 = [sum >> 8, sum & 0xFF];
            _ref.data[addr + size   - 2] = sum2[0];
            _ref.data[addr + size   - 1] = sum2[1];
            _ref.data[addr + size*2 - 2] = sum2[0];
            _ref.data[addr + size*2 - 1] = sum2[1];
            
            _ref.updateHex();
        }
        this.init      = init;
        this.check     = check;
        this.updateHex = updateHex;
        this.update    = doUpdate;
    }
    
    function UIHandler()
    {
        var _ref = this, controls = [];
        this.addr = 0;
        
        function grab(a)
        {
            var select = document.querySelectorAll(a);
            return (select.length === 1 ? select[0] : select);
        }
        
        function initDrag()
        {
            var dragIsFile = false;
            window.addEventListener("dragenter", function dragenter_Init(evt)
            {
                var dT = evt.dataTransfer;
                for(var i = dT.types.length, files = false; i--;)
                {
                    if(dT.types[i] === "Files") {files = true;}
                }
                var containsFiles = (files === true),
                    isOneItem     = (dT.items.length === 1);
                dragIsFile = (containsFiles && isOneItem) === true ? true : false;
            });
    
            window.addEventListener("dragover", function dragover_Check(evt)
            {
                evt.preventDefault();
                if(dragIsFile === false)
                {   
                    evt.dataTransfer.dropEffect = "none"; // prevents drop, shows red X
                }
            });
            
            window.addEventListener("drop", function drop_Check(evt)
            {
                evt.preventDefault();
                var fl = evt.dataTransfer.files[0];
                if(dragIsFile === true && (fl.size === 512 || fl.size === 2048) === true)
                {
                    File.doLoad(fl, evt.dataTransfer.items[0].webkitGetAsEntry());
                }
            });
        }
        
        function updateValues()
        {
            for(var i = 0; i < controls.length; i++)
            {
                controls[i].value = parseInt(Eeprom.data[_ref.addr + controls[i].metadata.offset], 10);
            }
        }
        
        function init()
        {
            chrome.storage.local.get("dataIndex", function(items)
            {
                if(items.dataIndex !== undefined)
                {
                    grab("select").selectedIndex = items.dataIndex / 112;
                    _ref.addr = items.dataIndex;
                }
            });
            
            for(var i = 0; i < 15; i++)
            {
                var txtBox      = document.createElement("input");
                txtBox.metadata = {type: "num", offset: 0x25 + i};
                txtBox.oninput  = Eeprom.update;
                controls.push(txtBox);
                grab("#out").appendChild(txtBox);
            }
            updateValues();
        }

        function select()
        {
            _ref.addr = this.selectedIndex * 112;
            chrome.storage.local.set({"dataIndex" : _ref.addr});
            updateValues();
        }
        this.init = init;
        this.updateValues = updateValues;
        this.grab = grab;
        this.save = grab("#sv1");
        this.select = select;
        this.filename = grab("#nam");
        this.initDrag = initDrag;
    }
    
    function FileHandler()
    {
        var _ref = this;
        
        function doSave(Entry)
        {
            Entry.createWriter(function(writer){Entry.file(function(fl)
            {
                writer.write( new Blob([ new Uint8Array(Eeprom.data) ]) );
                writer.onwriteend = function()
                {
                    writer.onwriteend = null;
                    writer.truncate(512);
                    console.log("File saved:  " + fl.name);
                    _ref.entry = Entry;
                    Editor.filename.innerText = fl.name;
                    Editor.save.disabled = false;
                };
            });});
        }
        
        function doLoad(fl, Entry)
        {
            var f   = new FileReader();
            f.entry = Entry;
            f.file  = fl;
            f.readAsArrayBuffer( fl.slice(0, 512) );
            f.onload = function()
            {
                var dat = new Uint8Array(f.result);
                if(Eeprom.check(dat) === 0x7FFF)
                {
                    _ref.entry = f.entry;
                    Eeprom.data = dat;
                    Editor.updateValues();
                    Eeprom.updateHex();
                    
                    Editor.save.disabled = false;
                    Editor.filename.innerText = f.file.name;
                    console.log("File loaded: " + f.file.name);
                }
            };
        }
        
        function openFile()
        {
            chrome.fileSystem.chooseEntry({type:"openFile"}, function(Entry)
            {
                Entry.file(function(fl)
                {
                    if(fl.size === 512 || fl.size === 2048)
                    {
                        _ref.doLoad(fl, Entry);
                    }
                });
            });
        }
        
        function saveAsFile()
        {
            chrome.fileSystem.chooseEntry({
            type:"saveFile",
            suggestedName: Editor.save.disabled ? "SUPER MARIO 64.eep" : Editor.filename.innerText,
            accepts: [ {extensions : ["eep"]} ]
            }, doSave);
        }
        
        function saveFile()
        {
            chrome.fileSystem.getWritableEntry(_ref.entry, doSave);
        }
        
        this.openFile   = openFile;
        this.saveAsFile = saveAsFile;
        this.saveFile   = saveFile;
        this.doLoad     = doLoad;
    }
    
    Eeprom = new EepromHandler();
    Editor = new UIHandler();
    File   = new FileHandler();
    
    Eeprom.init();
    Eeprom.updateHex();
    Editor.save.disabled = true;
    Editor.filename.innerText = "Unsaved file";
    Editor.initDrag(true);
    
    Editor.grab("#lod").onclick    = File.openFile;
    Editor.grab("#sv2").onclick    = File.saveAsFile;
    Editor.grab("#sv1").onclick    = File.saveFile;
    Editor.grab("select").onchange = Editor.select;
    Editor.init();
    
    //window.EEPROM = function(){console.log(Eeprom.data);return Eeprom.data;};
    window.ex = function(){ return [Eeprom, Editor, File]; };
});
