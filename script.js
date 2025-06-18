class FactoryLayoutPlanner {
    constructor() {
        this.canvas = document.getElementById('layoutCanvas');
        this.ctx = this.canvas.getContext('2d');
        this.fieldWidth = 20; // 米
        this.fieldHeight = 15; // 米
        this.scale = 30; // 像素/米
        this.machines = [];
        this.selectedMachine = null;
        this.dragging = false;
        this.dragStart = { x: 0, y: 0 };
        this.selectedMachineItem = null;
        this.machineCounter = 0;
        this.draggingMachine = false;
        this.draggedMachine = null;
        
        // 长按删除相关变量
        this.longPressTimer = null;
        this.longPressDelay = 800; // 长按时间阈值（毫秒）
        this.isLongPress = false;
        
        // 防抖更新相关变量
        this.updateTimer = null;
        this.updateDelay = 100; // 防抖延迟（毫秒）
        
        this.init();
    }

    init() {
        this.setupEventListeners();
        this.drawField();
        this.updateRulers();
        this.render();
    }

    setupEventListeners() {
        // 场地更新
        document.getElementById('updateField').addEventListener('click', () => {
            this.fieldWidth = parseInt(document.getElementById('fieldWidth').value);
            this.fieldHeight = parseInt(document.getElementById('fieldHeight').value);
            this.drawField();
            this.updateRulers();
            this.render();
        });

        // 添加机器
        document.getElementById('addMachine').addEventListener('click', () => {
            this.addMachine();
        });

        // 清空所有
        document.getElementById('clearAll').addEventListener('click', () => {
            this.clearAll();
        });

        // 导出布局
        document.getElementById('exportLayout').addEventListener('click', () => {
            this.exportLayout();
        });

        // 机器选择
        document.querySelectorAll('.machine-item').forEach(item => {
            item.addEventListener('click', (e) => {
                this.selectMachine(e.currentTarget);
            });
        });

        // 画布事件 - 鼠标事件
        this.canvas.addEventListener('mousedown', (e) => this.handleMouseDown(e));
        this.canvas.addEventListener('mousemove', (e) => this.handleMouseMove(e));
        this.canvas.addEventListener('mouseup', (e) => this.handleMouseUp(e));
        this.canvas.addEventListener('click', (e) => this.handleCanvasClick(e));

        // 画布事件 - 触摸事件（移动设备优化）
        this.canvas.addEventListener('touchstart', (e) => {
            e.preventDefault(); // 防止默认行为
            this.handleTouchStart(e);
        }, { passive: false });
        
        this.canvas.addEventListener('touchmove', (e) => {
            e.preventDefault(); // 防止默认行为
            this.handleTouchMove(e);
        }, { passive: false });
        
        this.canvas.addEventListener('touchend', (e) => {
            e.preventDefault(); // 防止默认行为
            this.handleTouchEnd(e);
        }, { passive: false });

        // 键盘事件
        document.addEventListener('keydown', (e) => this.handleKeyDown(e));

        // 窗口大小变化事件
        window.addEventListener('resize', () => {
            this.drawField();
            this.updateRulers();
            this.render();
        });
    }

    // 处理键盘事件
    handleKeyDown(e) {
        if (e.key === 'Delete' || e.key === 'Backspace') {
            if (this.selectedMachineItem) {
                this.deleteMachine(this.selectedMachineItem.id);
                this.selectedMachineItem = null;
            }
        }
    }

    // 处理触摸开始事件
    handleTouchStart(e) {
        const touch = e.touches[0];
        const rect = this.canvas.getBoundingClientRect();
        const x = touch.clientX - rect.left;
        const y = touch.clientY - rect.top;
        
        // 检查是否点击了机器
        const machine = this.getMachineAt(x, y);
        if (machine) {
            this.draggingMachine = true;
            this.draggedMachine = machine;
            this.selectedMachineItem = machine;
            this.dragStart = { 
                x: x - (40 + machine.x * this.scale), 
                y: y - (40 + machine.y * this.scale) 
            };
            
            // 开始长按计时器
            this.isLongPress = false;
            this.longPressTimer = setTimeout(() => {
                this.isLongPress = true;
                this.showDeleteConfirmation(machine);
            }, this.longPressDelay);
            
            // 移动设备振动反馈
            if (navigator.vibrate) {
                navigator.vibrate(50);
            }
            
            this.quickRender();
            return;
        }
        
        // 如果点击了空白区域且有选中的机器，添加机器
        if (this.selectedMachine && this.isInField(x, y)) {
            this.addMachineToField(x, y);
        }
    }

    // 处理触摸移动事件
    handleTouchMove(e) {
        if (this.draggingMachine && this.draggedMachine) {
            // 如果开始拖拽，取消长按计时器
            if (this.longPressTimer) {
                clearTimeout(this.longPressTimer);
                this.longPressTimer = null;
            }
            
            const touch = e.touches[0];
            const rect = this.canvas.getBoundingClientRect();
            const x = touch.clientX - rect.left;
            const y = touch.clientY - rect.top;
            
            const newX = (x - this.dragStart.x - 40) / this.scale;
            const newY = (y - this.dragStart.y - 40) / this.scale;
            
            // 确保设备在场地内
            const maxX = this.fieldWidth - this.draggedMachine.width;
            const maxY = this.fieldHeight - this.draggedMachine.height;
            
            const finalX = Math.max(0, Math.min(newX, maxX));
            const finalY = Math.max(0, Math.min(newY, maxY));
            
            // 检查碰撞
            if (!this.checkCollision(this.draggedMachine, finalX, finalY, 
                                   this.draggedMachine.width, this.draggedMachine.height)) {
                this.draggedMachine.x = finalX;
                this.draggedMachine.y = finalY;
                
                // 使用快速渲染，避免重复绘制场地
                this.quickRender();
            }
        }
    }

    // 处理触摸结束事件
    handleTouchEnd(e) {
        // 清除长按计时器
        if (this.longPressTimer) {
            clearTimeout(this.longPressTimer);
            this.longPressTimer = null;
        }
        
        this.draggingMachine = false;
        this.draggedMachine = null;
        this.isLongPress = false;
    }

    // 显示删除确认对话框
    showDeleteConfirmation(machine) {
        // 移动设备振动反馈
        if (navigator.vibrate) {
            navigator.vibrate(200);
        }
        
        if (confirm(`确定要删除 ${machine.name} ${machine.id} 吗？`)) {
            this.deleteMachine(machine.id);
        }
    }

    // 绘制场地
    drawField() {
        // 获取容器尺寸
        const container = this.canvas.parentElement;
        const containerWidth = container.clientWidth - 80; // 为标尺留空间
        const containerHeight = container.clientHeight - 80;
        
        // 计算画布实际尺寸（保持比例）
        const fieldAspectRatio = this.fieldWidth / this.fieldHeight;
        const containerAspectRatio = containerWidth / containerHeight;
        
        let canvasWidth, canvasHeight;
        if (containerAspectRatio > fieldAspectRatio) {
            // 容器更宽，以高度为准
            canvasHeight = containerHeight;
            canvasWidth = canvasHeight * fieldAspectRatio;
        } else {
            // 容器更高，以宽度为准
            canvasWidth = containerWidth;
            canvasHeight = canvasWidth / fieldAspectRatio;
        }
        
        // 设置画布尺寸
        this.canvas.width = canvasWidth + 80;
        this.canvas.height = canvasHeight + 80;
        
        // 重新计算缩放比例
        this.scale = canvasWidth / this.fieldWidth;
        
        // 清空画布
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
        
        // 绘制场地边界
        this.ctx.strokeStyle = '#000';
        this.ctx.lineWidth = Math.max(2, this.scale / 10); // 根据缩放调整线宽
        this.ctx.strokeRect(40, 40, canvasWidth, canvasHeight);
        
        // 绘制网格
        this.drawGrid();
        
        // 绘制场地尺寸标记
        this.drawFieldDimensions();
    }

    // 绘制场地尺寸标记
    drawFieldDimensions() {
        const canvasWidth = this.fieldWidth * this.scale;
        const canvasHeight = this.fieldHeight * this.scale;
        
        this.ctx.fillStyle = '#333';
        this.ctx.font = `bold ${Math.max(12, this.scale / 2)}px Arial`; // 根据缩放调整字体大小
        this.ctx.textAlign = 'center';
        
        // 宽度标记（在顶部和底部）
        this.ctx.fillText(`${this.fieldWidth}m`, 40 + canvasWidth/2, Math.max(20, this.scale / 2));
        this.ctx.fillText(`${this.fieldWidth}m`, 40 + canvasWidth/2, 40 + canvasHeight + Math.max(15, this.scale / 2));
        
        // 高度标记（在左侧和右侧）
        this.ctx.save();
        this.ctx.translate(Math.max(20, this.scale / 2), 40 + canvasHeight/2);
        this.ctx.rotate(-Math.PI/2);
        this.ctx.fillText(`${this.fieldHeight}m`, 0, 0);
        this.ctx.restore();
        
        this.ctx.save();
        this.ctx.translate(40 + canvasWidth + Math.max(20, this.scale / 2), 40 + canvasHeight/2);
        this.ctx.rotate(-Math.PI/2);
        this.ctx.fillText(`${this.fieldHeight}m`, 0, 0);
        this.ctx.restore();
    }

    // 绘制网格
    drawGrid() {
        this.ctx.strokeStyle = '#e0e0e0';
        this.ctx.lineWidth = Math.max(1, this.scale / 30); // 根据缩放调整线宽
        
        // 垂直线
        for (let x = 0; x <= this.fieldWidth; x++) {
            this.ctx.beginPath();
            this.ctx.moveTo(40 + x * this.scale, 40);
            this.ctx.lineTo(40 + x * this.scale, 40 + this.fieldHeight * this.scale);
            this.ctx.stroke();
        }
        
        // 水平线
        for (let y = 0; y <= this.fieldHeight; y++) {
            this.ctx.beginPath();
            this.ctx.moveTo(40, 40 + y * this.scale);
            this.ctx.lineTo(40 + this.fieldWidth * this.scale, 40 + y * this.scale);
            this.ctx.stroke();
        }
    }

    // 更新标尺
    updateRulers() {
        const rulerX = document.getElementById('rulerX');
        const rulerY = document.getElementById('rulerY');
        
        // 清空标尺
        rulerX.innerHTML = '';
        rulerY.innerHTML = '';
        
        // 计算标尺尺寸
        const rulerHeight = Math.max(30, this.scale / 2); // 根据缩放调整标尺高度
        const rulerWidth = Math.max(30, this.scale / 2);
        
        // 设置标尺样式
        rulerX.style.height = `${rulerHeight}px`;
        rulerY.style.width = `${rulerWidth}px`;
        
        // X轴标尺
        for (let x = 0; x <= this.fieldWidth; x++) {
            const mark = document.createElement('div');
            mark.className = 'ruler-mark';
            mark.style.left = `${40 + x * this.scale}px`;
            mark.style.height = `${Math.max(6, this.scale / 5)}px`; // 根据缩放调整标记高度
            rulerX.appendChild(mark);
            
            const label = document.createElement('div');
            label.className = 'ruler-label';
            label.textContent = `${x}m`;
            label.style.left = `${40 + x * this.scale}px`;
            label.style.fontSize = `${Math.max(10, this.scale / 3)}px`; // 根据缩放调整字体大小
            rulerX.appendChild(label);
        }
        
        // Y轴标尺
        for (let y = 0; y <= this.fieldHeight; y++) {
            const mark = document.createElement('div');
            mark.className = 'ruler-mark';
            mark.style.top = `${40 + y * this.scale}px`;
            mark.style.width = `${Math.max(6, this.scale / 5)}px`; // 根据缩放调整标记宽度
            rulerY.appendChild(mark);
            
            const label = document.createElement('div');
            label.className = 'ruler-label';
            label.textContent = `${y}m`;
            label.style.top = `${40 + y * this.scale}px`;
            label.style.fontSize = `${Math.max(10, this.scale / 3)}px`; // 根据缩放调整字体大小
            rulerY.appendChild(label);
        }
    }

    // 添加机器
    addMachine() {
        if (!this.selectedMachine) {
            alert('请先选择机器类型');
            return;
        }
        
        const machine = {
            id: ++this.machineCounter,
            x: 2.5,
            y: 2.5,
            width: this.selectedMachine.width,
            height: this.selectedMachine.height,
            name: this.selectedMachine.name,
            icon: this.selectedMachine.icon,
            machineType: this.selectedMachine.type,
            allowOverlap: this.selectedMachine.type !== 'obstacle', // 障碍物默认不允许叠放
            type: 'machine'
        };
        
        this.machines.push(machine);
        this.updateMachinesList();
        this.render();
    }

    // 更新机器列表
    updateMachinesList() {
        const list = document.getElementById('machinesList');
        list.innerHTML = '';
        
        this.machines.forEach(machine => {
            const item = document.createElement('div');
            item.className = 'machine-item';
            item.innerHTML = `
                <div>
                    <div>${machine.name} ${machine.id}</div>
                    <div style="font-size: 0.7rem; color: #6c757d;">
                        宽: <input type="number" id="width_${machine.id}" value="${machine.width.toFixed(2)}" min="0.01" max="20" step="0.01">
                        高: <input type="number" id="height_${machine.id}" value="${machine.height.toFixed(2)}" min="0.01" max="20" step="0.01">
                    </div>
                    <div class="overlap-toggle">
                        <input type="checkbox" id="overlap_${machine.id}" 
                               ${machine.allowOverlap ? 'checked' : ''} 
                               ${machine.machineType === 'obstacle' ? 'disabled' : ''}>
                        <label for="overlap_${machine.id}">允许叠放</label>
                        ${machine.machineType === 'obstacle' ? '<small style="color: #6c757d;">(障碍物不可叠放)</small>' : ''}
                    </div>
                </div>
                <button class="delete-btn" onclick="planner.deleteMachine(${machine.id})">删除</button>
            `;
            list.appendChild(item);
            
            // 添加输入事件监听器
            const widthInput = document.getElementById(`width_${machine.id}`);
            const heightInput = document.getElementById(`height_${machine.id}`);
            const overlapInput = document.getElementById(`overlap_${machine.id}`);
            
            widthInput.addEventListener('input', (e) => {
                this.updateItemSize('machine', machine.id, 'width', e.target.value);
            });
            
            heightInput.addEventListener('input', (e) => {
                this.updateItemSize('machine', machine.id, 'height', e.target.value);
            });
            
            // 添加失去焦点时的验证
            widthInput.addEventListener('blur', (e) => {
                this.validateAndUpdateSize('machine', machine.id, 'width', e.target.value);
            });
            
            heightInput.addEventListener('blur', (e) => {
                this.validateAndUpdateSize('machine', machine.id, 'height', e.target.value);
            });
            
            overlapInput.addEventListener('change', (e) => {
                this.toggleOverlap(machine.id, e.target.checked);
            });
        });
    }

    // 统一更新尺寸方法
    updateItemSize(type, id, dimension, value) {
        if (type === 'machine') {
            const machine = this.machines.find(m => m.id === id);
            if (machine) {
                const newValue = parseFloat(value);
                
                // 如果输入为空或无效，不更新
                if (isNaN(newValue) || newValue <= 0) {
                    return;
                }
                
                // 限制最大尺寸
                if (newValue > 20) {
                    return;
                }
                
                // 保存原值用于恢复
                const oldValue = machine[dimension];
                machine[dimension] = newValue;
                
                // 检查新尺寸是否会导致碰撞
                if (this.checkCollision(machine, machine.x, machine.y, machine.width, machine.height)) {
                    // 如果会碰撞，恢复原值
                    machine[dimension] = oldValue;
                    // 恢复输入框的值
                    const input = document.getElementById(`${dimension}_${id}`);
                    if (input) {
                        input.value = oldValue.toFixed(2);
                    }
                } else {
                    // 使用防抖更新画布
                    this.debouncedRender();
                }
            }
        }
    }

    // 防抖渲染方法
    debouncedRender() {
        if (this.updateTimer) {
            clearTimeout(this.updateTimer);
        }
        this.updateTimer = setTimeout(() => {
            this.quickRender();
        }, this.updateDelay);
    }

    // 验证并更新尺寸（失去焦点时调用）
    validateAndUpdateSize(type, id, dimension, value) {
        if (type === 'machine') {
            const machine = this.machines.find(m => m.id === id);
            if (machine) {
                let newValue = parseFloat(value);
                
                // 验证输入值
                if (isNaN(newValue) || newValue <= 0) {
                    newValue = 0.01;
                } else if (newValue > 20) {
                    newValue = 20;
                }
                
                // 格式化到两位小数
                newValue = Math.round(newValue * 100) / 100;
                
                // 更新输入框显示
                const input = document.getElementById(`${dimension}_${id}`);
                if (input) {
                    input.value = newValue.toFixed(2);
                }
                
                // 如果值有变化，更新机器尺寸
                if (Math.abs(newValue - machine[dimension]) > 0.001) {
                    const oldValue = machine[dimension];
                    machine[dimension] = newValue;
                    
                    // 检查新尺寸是否会导致碰撞
                    if (this.checkCollision(machine, machine.x, machine.y, machine.width, machine.height)) {
                        // 如果会碰撞，恢复原值
                        machine[dimension] = oldValue;
                        if (input) {
                            input.value = oldValue.toFixed(2);
                        }
                        alert('新尺寸会导致与其他设备重叠，已恢复原值');
                    } else {
                        // 立即更新画布
                        this.quickRender();
                    }
                }
            }
        }
    }

    // 更新机器叠放设置
    updateMachineOverlap(id, allowOverlap) {
        const machine = this.machines.find(m => m.id === id);
        if (machine) {
            machine.allowOverlap = allowOverlap;
        }
    }

    // 切换机器叠放设置
    toggleOverlap(machineId, allowOverlap) {
        const machine = this.machines.find(m => m.id === machineId);
        if (machine && machine.machineType !== 'obstacle') {
            machine.allowOverlap = allowOverlap;
            this.debouncedRender();
        }
    }

    // 删除机器
    deleteMachine(id) {
        this.machines = this.machines.filter(m => m.id !== id);
        if (this.selectedMachineItem && this.selectedMachineItem.id === id) {
            this.selectedMachineItem = null;
        }
        this.updateMachinesList();
        this.render();
    }

    // 选择机器
    selectMachine(element) {
        // 移除之前的选中状态
        document.querySelectorAll('.machine-item').forEach(item => {
            item.classList.remove('selected');
        });
        
        // 添加选中状态
        element.classList.add('selected');
        
        // 获取机器信息
        const machineType = element.getAttribute('data-machine');
        const width = parseFloat(element.getAttribute('data-width'));
        const height = parseFloat(element.getAttribute('data-height'));
        
        // 根据机器类型设置详细信息
        let name, icon;
        switch(machineType) {
            case 'obstacle':
                name = '障碍物';
                icon = '🚧';
                break;
            case 'cnc':
                name = 'CNC机床';
                icon = '🖥️';
                break;
            case 'robot':
                name = '工业机器人';
                icon = '🤖';
                break;
            case 'conveyor':
                name = '传送带';
                icon = '📦';
                break;
            case 'press':
                name = '冲压机';
                icon = '⚡';
                break;
            case 'furnace':
                name = '热处理炉';
                icon = '🔥';
                break;
            case 'storage':
                name = '仓储区';
                icon = '📦';
                break;
            default:
                name = '未知机器';
                icon = '⚙️';
        }
        
        this.selectedMachine = {
            type: machineType,
            name: name,
            icon: icon,
            width: width,
            height: height
        };
        
        this.selectedMachineItem = element;
    }

    // 检查碰撞
    checkCollision(item, x, y, width, height) {
        // 检查与机器的碰撞
        for (let machine of this.machines) {
            if (machine.id === item.id) continue;
            
            // 如果当前项目是机器，检查叠放权限
            if (item && item.type === 'machine') {
                // 障碍物类型的机器始终不可叠放
                if (item.machineType === 'obstacle' || machine.machineType === 'obstacle') {
                    if (this.isColliding(x, y, width, height, 
                                       machine.x, machine.y, machine.width, machine.height)) {
                        return true;
                    }
                } else {
                    // 其他机器根据叠放设置判断
                    if (!item.allowOverlap || !machine.allowOverlap) {
                        if (this.isColliding(x, y, width, height, 
                                           machine.x, machine.y, machine.width, machine.height)) {
                            return true;
                        }
                    }
                }
            } else {
                // 如果当前项目不是机器，始终检测碰撞
                if (this.isColliding(x, y, width, height, 
                                   machine.x, machine.y, machine.width, machine.height)) {
                    return true;
                }
            }
        }
        
        return false;
    }

    // 碰撞检测算法
    isColliding(x1, y1, w1, h1, x2, y2, w2, h2) {
        return x1 < x2 + w2 && x1 + w1 > x2 && y1 < y2 + h2 && y1 + h1 > y2;
    }

    // 鼠标事件处理
    handleMouseDown(e) {
        const rect = this.canvas.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;
        
        // 检查是否点击了机器
        const machine = this.getMachineAt(x, y);
        if (machine) {
            this.draggingMachine = true;
            this.draggedMachine = machine;
            this.selectedMachineItem = machine;
            this.dragStart = { 
                x: x - (40 + machine.x * this.scale), 
                y: y - (40 + machine.y * this.scale) 
            };
            this.quickRender();
            return;
        }
        
        // 如果点击了空白区域且有选中的机器，添加机器
        if (this.selectedMachine && this.isInField(x, y)) {
            this.addMachineToField(x, y);
        }
    }

    handleMouseMove(e) {
        const rect = this.canvas.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;
        
        // 统一的拖拽逻辑
        if (this.draggingMachine && this.draggedMachine) {
            const newX = (x - this.dragStart.x - 40) / this.scale;
            const newY = (y - this.dragStart.y - 40) / this.scale;
            
            // 确保设备在场地内
            const maxX = this.fieldWidth - this.draggedMachine.width;
            const maxY = this.fieldHeight - this.draggedMachine.height;
            
            const finalX = Math.max(0, Math.min(newX, maxX));
            const finalY = Math.max(0, Math.min(newY, maxY));
            
            // 检查碰撞
            if (!this.checkCollision(this.draggedMachine, finalX, finalY, 
                                   this.draggedMachine.width, this.draggedMachine.height)) {
                this.draggedMachine.x = finalX;
                this.draggedMachine.y = finalY;
                
                // 使用快速渲染，避免重复绘制场地
                this.quickRender();
            }
        }
    }

    handleMouseUp(e) {
        this.draggingMachine = false;
        this.draggedMachine = null;
    }

    handleCanvasClick(e) {
        const rect = this.canvas.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;
        
        // 如果点击了机器，选中它
        const machine = this.getMachineAt(x, y);
        if (machine) {
            this.selectedMachineItem = machine;
            this.quickRender();
            return;
        }
        
        // 点击空白区域，清除选择
        this.selectedMachineItem = null;
        this.quickRender();
    }

    // 添加机器到场地
    addMachineToField(x, y) {
        const fieldX = (x - 40) / this.scale;
        const fieldY = (y - 40) / this.scale;
        
        // 检查碰撞
        if (this.checkCollision(null, fieldX, fieldY, 
                               this.selectedMachine.width, this.selectedMachine.height)) {
            alert('该位置与其他设备重叠，无法放置');
            return;
        }
        
        const machine = {
            id: ++this.machineCounter,
            x: fieldX,
            y: fieldY,
            width: this.selectedMachine.width,
            height: this.selectedMachine.height,
            name: this.selectedMachine.name,
            icon: this.selectedMachine.icon,
            machineType: this.selectedMachine.type,
            allowOverlap: this.selectedMachine.type !== 'obstacle',
            type: 'machine'
        };
        
        this.machines.push(machine);
        this.updateMachinesList();
        this.render();
    }

    // 获取指定位置的机器
    getMachineAt(x, y) {
        return this.machines.find(machine => 
            x >= 40 + machine.x * this.scale && 
            x <= 40 + (machine.x + machine.width) * this.scale &&
            y >= 40 + machine.y * this.scale && 
            y <= 40 + (machine.y + machine.height) * this.scale
        );
    }

    // 检查点是否在场地内
    isInField(x, y) {
        return x >= 40 && x <= 40 + this.fieldWidth * this.scale &&
               y >= 40 && y <= 40 + this.fieldHeight * this.scale;
    }

    // 渲染所有元素
    render() {
        this.drawField();
        this.drawAllItems();
    }

    // 只绘制所有设备（用于拖拽时）
    drawAllItems() {
        // 绘制机器
        this.machines.forEach(machine => {
            this.drawMachine(machine);
        });
    }

    // 快速渲染（只重绘设备，不重绘场地）
    quickRender() {
        // 清除设备区域
        const canvasWidth = this.fieldWidth * this.scale;
        const canvasHeight = this.fieldHeight * this.scale;
        this.ctx.clearRect(40, 40, canvasWidth, canvasHeight);
        
        // 重新绘制网格
        this.drawGrid();
        
        // 绘制所有设备
        this.drawAllItems();
    }

    // 绘制机器（工程图风格）
    drawMachine(machine) {
        const x = 40 + machine.x * this.scale;
        const y = 40 + machine.y * this.scale;
        const width = machine.width * this.scale;
        const height = machine.height * this.scale;

        // 0. 如果设备被选中，绘制高亮边框
        if (this.selectedMachineItem && this.selectedMachineItem.id === machine.id) {
            this.ctx.save();
            this.ctx.strokeStyle = '#667eea';
            this.ctx.lineWidth = 3;
            this.ctx.setLineDash([5, 5]);
            this.ctx.strokeRect(x - 2, y - 2, width + 4, height + 4);
            this.ctx.restore();
        }

        // 1. 绘制设备矩形（黑色细线）
        this.ctx.save();
        this.ctx.strokeStyle = '#111';
        this.ctx.lineWidth = 1.2;
        this.ctx.setLineDash([]);
        this.ctx.strokeRect(x, y, width, height);
        this.ctx.restore();

        // 2. 绘制设备名称（黑色，居中）
        this.ctx.save();
        this.ctx.fillStyle = '#111';
        this.ctx.font = `${Math.max(16, this.scale / 1.5)}px sans-serif`;
        this.ctx.textAlign = 'center';
        this.ctx.textBaseline = 'middle';
        this.ctx.fillText(machine.name, x + width / 2, y + height / 2);
        this.ctx.restore();

        // 3. 绘制尺寸标注（红色细线+红色字体，在框内显示）
        this.ctx.save();
        this.ctx.strokeStyle = '#d32f2f';
        this.ctx.fillStyle = '#d32f2f';
        this.ctx.lineWidth = 1;
        this.ctx.font = `${Math.max(10, this.scale / 4)}px sans-serif`;
        this.ctx.textAlign = 'center';
        this.ctx.textBaseline = 'middle';
        
        // 只在框内显示一个长边和一个宽边的尺寸
        const padding = Math.max(8, this.scale / 8); // 内边距
        
        // 上边尺寸线（在框内）
        this.ctx.beginPath();
        this.ctx.moveTo(x + padding, y + padding);
        this.ctx.lineTo(x + width - padding, y + padding);
        this.ctx.stroke();
        this.ctx.fillText(`${machine.width.toFixed(2)}m`, x + width / 2, y + padding + 8);
        
        // 左边尺寸线（在框内）
        this.ctx.beginPath();
        this.ctx.moveTo(x + padding, y + padding);
        this.ctx.lineTo(x + padding, y + height - padding);
        this.ctx.stroke();
        this.ctx.save();
        this.ctx.translate(x + padding + 8, y + height / 2);
        this.ctx.rotate(-Math.PI / 2);
        this.ctx.fillText(`${machine.height.toFixed(2)}m`, 0, 0);
        this.ctx.restore();
        
        this.ctx.restore();
    }

    // 清空所有
    clearAll() {
        if (confirm('确定要清空所有内容吗？')) {
            this.machines = [];
            this.selectedMachineItem = null;
            this.selectedMachine = null;
            this.machineCounter = 0;
            this.updateMachinesList();
            this.render();
            
            // 清除机器选择
            document.querySelectorAll('.machine-item').forEach(item => {
                item.classList.remove('selected');
            });
        }
    }

    // 导出布局
    exportLayout() {
        const layout = {
            field: {
                width: this.fieldWidth,
                height: this.fieldHeight
            },
            machines: this.machines,
            exportTime: new Date().toISOString()
        };
        
        const dataStr = JSON.stringify(layout, null, 2);
        const dataBlob = new Blob([dataStr], {type: 'application/json'});
        
        const link = document.createElement('a');
        link.href = URL.createObjectURL(dataBlob);
        link.download = `工厂布局_${new Date().toLocaleDateString()}.json`;
        link.click();
    }
}

// 初始化应用
let planner;
document.addEventListener('DOMContentLoaded', () => {
    planner = new FactoryLayoutPlanner();
}); 