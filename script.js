class FactoryLayoutPlanner {
    constructor() {
        this.canvas = document.getElementById('layoutCanvas');
        this.ctx = this.canvas.getContext('2d');
        this.fieldWidth = 35; // 米
        this.fieldHeight = 35; // 米
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
        
        // 自定义机器名字
        this.customMachineName = '';
        
        // 实时渲染优化
        this.lastRenderTime = 0;
        this.renderInterval = 16; // 约60fps
        
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

        // 导出图片
        document.getElementById('exportImage').addEventListener('click', () => {
            this.exportImage();
        });

        // 机器选择
        document.querySelectorAll('.machine-item').forEach(item => {
            item.addEventListener('click', (e) => {
                this.selectMachine(e.currentTarget);
            });
        });

        // 自定义机器名字输入
        document.getElementById('customMachineName').addEventListener('input', (e) => {
            this.customMachineName = e.target.value.trim();
            // 如果当前有选中的机器，实时更新显示
            if (this.selectedMachine) {
                this.selectedMachine.name = this.customMachineName || this.getDefaultMachineName(this.selectedMachine.type);
            }
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

    // 获取默认机器名字
    getDefaultMachineName(machineType) {
        switch(machineType) {
            case 'obstacle':
                return '障碍物';
            case 'cnc':
                return '旋切机';
            case 'robot':
                return '上料机';
            case 'conveyor':
                return '出渣机';
            case 'press':
                return '传送带';
            case 'furnace':
                return '找圆机';
            case 'storage':
                return '接板机';
            default:
                return '未知机器';
        }
    }

    // 处理键盘事件
    handleKeyDown(e) {
        if (e.key === '\\' || e.key === 'Backslash') {
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
            allowOverlap: false, // 默认不允许叠放
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
                    <div>
                        <input type="text" id="name_${machine.id}" value="${machine.name}" 
                               style="width: 120px; margin-right: 5px; font-size: 0.9rem;"
                               placeholder="机器名称">
                        <span style="color: #6c757d; font-size: 0.8rem;">ID: ${machine.id}</span>
                    </div>
                    <div style="font-size: 0.7rem; color: #6c757d; margin-top: 5px;">
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
            const nameInput = document.getElementById(`name_${machine.id}`);
            const widthInput = document.getElementById(`width_${machine.id}`);
            const heightInput = document.getElementById(`height_${machine.id}`);
            const overlapInput = document.getElementById(`overlap_${machine.id}`);
            
            // 机器名字编辑
            nameInput.addEventListener('input', (e) => {
                machine.name = e.target.value.trim() || this.getDefaultMachineName(machine.machineType);
                this.quickRender();
            });
            
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
                name = '旋切机';
                icon = '🖥️';
                break;
            case 'robot':
                name = '上料机';
                icon = '🤖';
                break;
            case 'conveyor':
                name = '出渣机';
                icon = '📦';
                break;
            case 'press':
                name = '传送带';
                icon = '⚡';
                break;
            case 'furnace':
                name = '找圆机';
                icon = '🔥';
                break;
            case 'storage':
                name = '接板机';
                icon = '📦';
                break;
            default:
                name = '未知机器';
                icon = '⚙️';
        }
        
        // 使用自定义名字或默认名字
        const finalName = this.customMachineName || name;
        
        this.selectedMachine = {
            type: machineType,
            name: finalName,
            icon: icon,
            width: width,
            height: height
        };
        
        this.selectedMachineItem = element;
        
        // 清空自定义名字输入框，让用户重新输入
        this.customMachineName = '';
        document.getElementById('customMachineName').value = '';
        document.getElementById('customMachineName').placeholder = `输入${name}名称`;
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
            allowOverlap: false,
            type: 'machine'
        };
        
        this.machines.push(machine);
        this.updateMachinesList();
        this.render();
        
        // 清空自定义名字输入框
        this.customMachineName = '';
        document.getElementById('customMachineName').value = '';
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
        // 实时渲染优化：限制渲染频率
        const now = performance.now();
        if (now - this.lastRenderTime < this.renderInterval) {
            return;
        }
        this.lastRenderTime = now;
        
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
        // 实时渲染优化：限制渲染频率
        const now = performance.now();
        if (now - this.lastRenderTime < this.renderInterval) {
            return;
        }
        this.lastRenderTime = now;
        
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

        // 2. 绘制设备名称（黑色，右下角，实时渲染优化）
        this.ctx.save();
        this.ctx.fillStyle = '#111';
        
        const fontSize = Math.max(12, Math.min(this.scale / 2, height / 4));
        this.ctx.font = `${fontSize}px "Microsoft YaHei", "PingFang SC", "Helvetica Neue", Arial, sans-serif`;
        this.ctx.textAlign = 'right';
        this.ctx.textBaseline = 'bottom';
        
        // 启用字体平滑
        this.ctx.imageSmoothingEnabled = true;
        this.ctx.imageSmoothingQuality = 'high';
        
        // 绘制文字阴影
        this.ctx.shadowColor = 'rgba(255, 255, 255, 0.8)';
        this.ctx.shadowBlur = 2;
        this.ctx.shadowOffsetX = 1;
        this.ctx.shadowOffsetY = 1;
        
        // 绘制文字在右下角，留出一些边距
        const namePadding = Math.max(4, this.scale / 8);
        this.ctx.fillText(machine.name, x + width - namePadding, y + height - namePadding);
        
        // 清除阴影
        this.ctx.shadowColor = 'transparent';
        this.ctx.shadowBlur = 0;
        this.ctx.shadowOffsetX = 0;
        this.ctx.shadowOffsetY = 0;
        
        this.ctx.restore();

        // 3. 绘制尺寸标注（红色细线+红色字体，在框内显示）
        this.ctx.save();
        this.ctx.strokeStyle = '#d32f2f';
        this.ctx.fillStyle = '#d32f2f';
        this.ctx.lineWidth = 1;
        
        // 计算尺寸标注字体大小
        const dimensionFontSize = Math.max(10, Math.min(this.scale / 4, height / 6));
        this.ctx.font = `${dimensionFontSize}px "Microsoft YaHei", "PingFang SC", "Helvetica Neue", Arial, sans-serif`;
        this.ctx.textAlign = 'center';
        this.ctx.textBaseline = 'middle';
        
        // 启用字体平滑
        this.ctx.imageSmoothingEnabled = true;
        this.ctx.imageSmoothingQuality = 'high';
        
        // 只在框内显示一个长边和一个宽边的尺寸
        const padding = Math.max(8, this.scale / 8); // 内边距
        
        // 上边尺寸线（在框内）
        this.ctx.beginPath();
        this.ctx.moveTo(x + padding, y + padding);
        this.ctx.lineTo(x + width - padding, y + padding);
        this.ctx.stroke();
        
        // 绘制尺寸文字
        this.ctx.shadowColor = 'rgba(255, 255, 255, 0.8)';
        this.ctx.shadowBlur = 1;
        this.ctx.shadowOffsetX = 0.5;
        this.ctx.shadowOffsetY = 0.5;
        this.ctx.fillText(this.formatNumber(machine.width), x + width / 2, y + padding + dimensionFontSize / 2);
        
        // 左边尺寸线（在框内）
        this.ctx.beginPath();
        this.ctx.moveTo(x + padding, y + padding);
        this.ctx.lineTo(x + padding, y + height - padding);
        this.ctx.stroke();
        
        // 绘制左边尺寸文字（旋转90度）
        this.ctx.save();
        this.ctx.translate(x + padding + dimensionFontSize / 2, y + height / 2);
        this.ctx.rotate(-Math.PI / 2);
        this.ctx.shadowColor = 'rgba(255, 255, 255, 0.8)';
        this.ctx.shadowBlur = 1;
        this.ctx.shadowOffsetX = 0.5;
        this.ctx.shadowOffsetY = 0.5;
        this.ctx.fillText(this.formatNumber(machine.height), 0, 0);
        this.ctx.restore();
        
        // 清除阴影
        this.ctx.shadowColor = 'transparent';
        this.ctx.shadowBlur = 0;
        this.ctx.shadowOffsetX = 0;
        this.ctx.shadowOffsetY = 0;
        
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
        // 计算实际长宽
        const actualDimensions = this.calculateActualDimensions();
        
        const layout = {
            field: {
                width: this.fieldWidth,
                height: this.fieldHeight
            },
            actualDimensions: {
                width: actualDimensions.width,
                height: actualDimensions.height,
                minX: actualDimensions.minX,
                minY: actualDimensions.minY,
                maxX: actualDimensions.maxX,
                maxY: actualDimensions.maxY
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

    // 导出图片
    exportImage() {
        // 创建临时canvas用于导出
        const exportCanvas = document.createElement('canvas');
        const exportCtx = exportCanvas.getContext('2d');
        
        // 计算动态分辨率：场地长度*50 × 场地宽度*50 + 边距
        const targetWidth = this.fieldWidth * 70 + 600;
        const targetHeight = this.fieldHeight * 70 + 600;
        
        // 设置canvas尺寸为动态分辨率
        exportCanvas.width = targetWidth;
        exportCanvas.height = targetHeight;
        
        // 计算缩放比例，保持原有的显示比例
        const originalWidth = this.fieldWidth * this.scale;
        const originalHeight = this.fieldHeight * this.scale;
        const scaleX = (targetWidth-600) / originalWidth; // 减去边距
        const scaleY = (targetHeight-600) / originalHeight; // 减去边距
        const scale = Math.min(scaleX, scaleY); // 使用较小的缩放比例保持比例
        
        // 计算居中偏移，确保内容在边距内居中显示
        const contentWidth = originalWidth * scale;
        const contentHeight = originalHeight * scale;
        const offsetX = (targetWidth - contentWidth) / 2*0;
        const offsetY = (targetHeight - contentHeight) / 2*0;
        
        // 设置白色背景
        exportCtx.fillStyle = '#ffffff';
        exportCtx.fillRect(0, 0, targetWidth, targetHeight);
        
        // 应用缩放和偏移
        exportCtx.save();
        exportCtx.translate(offsetX, offsetY);
        exportCtx.scale(scale, scale);
        
        // 绘制场地边框
        exportCtx.save();
        exportCtx.strokeStyle = '#333';
        exportCtx.lineWidth = 2;
        exportCtx.strokeRect(40, 40, this.fieldWidth * this.scale, this.fieldHeight * this.scale);
        exportCtx.restore();
        
        // 绘制网格
        this.drawGridOnContext(exportCtx, 40);
        
        // 绘制场地尺寸标注
        this.drawFieldDimensionsOnContext(exportCtx, 40);
        
        // 绘制所有机器（不包含选中状态）
        this.machines.forEach(machine => {
            this.drawMachineOnContext(exportCtx, machine, 40, false);
        });
        
        exportCtx.restore();
        
        // 绘制标题（在缩放后的坐标系中）
        exportCtx.save();
        exportCtx.fillStyle = '#333';
        exportCtx.font = `bold ${24 * scale}px "Microsoft YaHei", "PingFang SC", "Helvetica Neue", Arial, sans-serif`;
        exportCtx.textAlign = 'center';
        exportCtx.fillText('工厂机器布局图', targetWidth / 2, 20 * scale);
        exportCtx.restore();
        
        // 绘制导出信息（在缩放后的坐标系中）
        exportCtx.save();
        exportCtx.fillStyle = '#666';
        exportCtx.font = `${12 * scale}px "Microsoft YaHei", "PingFang SC", "Helvetica Neue", Arial, sans-serif`;
        exportCtx.textAlign = 'left';
        
        // 计算实际长宽
        const actualDimensions = this.calculateActualDimensions();
        
        exportCtx.fillText(`场地尺寸: ${this.fieldWidth}m × ${this.fieldHeight}m`, 10 * scale, targetHeight - 45 * scale);
        if (this.machines.length > 0) {
            exportCtx.fillText(`实际占用: ${this.formatNumber(actualDimensions.width)}m × ${this.formatNumber(actualDimensions.height)}m`, 10 * scale, targetHeight - 30 * scale);
        }
        exportCtx.fillText(`机器数量: ${this.machines.length}台`, 10 * scale, targetHeight - 15 * scale);
        //exportCtx.fillText(`导出时间: ${new Date().toLocaleString()}`, targetWidth - 200 * scale, targetHeight - 15 * scale);
        exportCtx.restore();
        
        // 导出图片
        try {
            const dataURL = exportCanvas.toDataURL('image/png', 1.0);
            const link = document.createElement('a');
            link.href = dataURL;
            link.download = `工厂布局图_${this.fieldWidth}x${this.fieldHeight}_${new Date().toLocaleDateString()}.png`;
            link.click();
        } catch (error) {
            alert('导出图片失败，请重试');
            console.error('导出图片错误:', error);
        }
    }
    
    // 在指定context上绘制网格
    drawGridOnContext(ctx, margin) {
        ctx.save();
        ctx.strokeStyle = '#e0e0e0';
        ctx.lineWidth = 1;
        
        // 绘制垂直网格线
        for (let x = 0; x <= this.fieldWidth; x++) {
            const pixelX = margin + x * this.scale;
            ctx.beginPath();
            ctx.moveTo(pixelX, margin);
            ctx.lineTo(pixelX, margin + this.fieldHeight * this.scale);
            ctx.stroke();
        }
        
        // 绘制水平网格线
        for (let y = 0; y <= this.fieldHeight; y++) {
            const pixelY = margin + y * this.scale;
            ctx.beginPath();
            ctx.moveTo(margin, pixelY);
            ctx.lineTo(margin + this.fieldWidth * this.scale, pixelY);
            ctx.stroke();
        }
        
        ctx.restore();
    }
    
    // 在指定context上绘制场地尺寸标注
    drawFieldDimensionsOnContext(ctx, margin) {
        ctx.save();
        ctx.fillStyle = '#333';
        ctx.font = `${Math.max(12, this.scale / 3)}px "Microsoft YaHei", "PingFang SC", "Helvetica Neue", Arial, sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        
        // 绘制宽度标注
        const centerX = margin + (this.fieldWidth * this.scale) / 2;
        const centerY = margin + this.fieldHeight * this.scale + 20;
        ctx.fillText(this.formatNumber(this.fieldWidth), centerX, centerY);
        
        // 绘制高度标注
        const centerY2 = margin + (this.fieldHeight * this.scale) / 2;
        const centerX2 = margin + this.fieldWidth * this.scale + 20;
        ctx.save();
        ctx.translate(centerX2, centerY2);
        ctx.rotate(-Math.PI / 2);
        ctx.fillText(this.formatNumber(this.fieldHeight), 0, 0);
        ctx.restore();
        
        ctx.restore();
    }
    
    // 在指定context上绘制机器（用于导出）
    drawMachineOnContext(ctx, machine, margin, showSelection = false) {
        const x = margin + machine.x * this.scale;
        const y = margin + machine.y * this.scale;
        const width = machine.width * this.scale;
        const height = machine.height * this.scale;

        // 如果设备被选中且需要显示选中状态，绘制高亮边框
        if (showSelection && this.selectedMachineItem && this.selectedMachineItem.id === machine.id) {
            ctx.save();
            ctx.strokeStyle = '#667eea';
            ctx.lineWidth = 3;
            ctx.setLineDash([5, 5]);
            ctx.strokeRect(x - 2, y - 2, width + 4, height + 4);
            ctx.restore();
        }

        // 绘制设备矩形（黑色细线）
        ctx.save();
        ctx.strokeStyle = '#111';
        ctx.lineWidth = 1.2;
        ctx.setLineDash([]);
        ctx.strokeRect(x, y, width, height);
        ctx.restore();

        // 绘制设备名称
        ctx.save();
        ctx.fillStyle = '#111';
        
        const fontSize = Math.max(12, Math.min(this.scale / 2, height / 4));
        ctx.font = `${fontSize}px "Microsoft YaHei", "PingFang SC", "Helvetica Neue", Arial, sans-serif`;
        ctx.textAlign = 'right';
        ctx.textBaseline = 'bottom';
        
        // 启用字体平滑
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'high';
        
        // 绘制文字阴影
        ctx.shadowColor = 'rgba(255, 255, 255, 0.8)';
        ctx.shadowBlur = 2;
        ctx.shadowOffsetX = 1;
        ctx.shadowOffsetY = 1;
        
        // 绘制文字在右下角，留出一些边距
        const namePadding = Math.max(4, this.scale / 8);
        ctx.fillText(machine.name, x + width - namePadding, y + height - namePadding);
        
        // 清除阴影
        ctx.shadowColor = 'transparent';
        ctx.shadowBlur = 0;
        ctx.shadowOffsetX = 0;
        ctx.shadowOffsetY = 0;
        
        ctx.restore();

        // 绘制尺寸标注
        ctx.save();
        ctx.strokeStyle = '#d32f2f';
        ctx.fillStyle = '#d32f2f';
        ctx.lineWidth = 1;
        
        const dimensionFontSize = Math.max(10, Math.min(this.scale / 4, height / 6));
        ctx.font = `${dimensionFontSize}px "Microsoft YaHei", "PingFang SC", "Helvetica Neue", Arial, sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'high';
        
        const padding = Math.max(8, this.scale / 8);
        
        // 上边尺寸线
        ctx.beginPath();
        ctx.moveTo(x + padding, y + padding);
        ctx.lineTo(x + width - padding, y + padding);
        ctx.stroke();
        
        // 绘制尺寸文字
        ctx.shadowColor = 'rgba(255, 255, 255, 0.8)';
        ctx.shadowBlur = 1;
        ctx.shadowOffsetX = 0.5;
        ctx.shadowOffsetY = 0.5;
        ctx.fillText(this.formatNumber(machine.width), x + width / 2, y + padding + dimensionFontSize / 2);
        
        // 左边尺寸线
        ctx.beginPath();
        ctx.moveTo(x + padding, y + padding);
        ctx.lineTo(x + padding, y + height - padding);
        ctx.stroke();
        
        // 绘制左边尺寸文字
        ctx.save();
        ctx.translate(x + padding + dimensionFontSize / 2, y + height / 2);
        ctx.rotate(-Math.PI / 2);
        ctx.shadowColor = 'rgba(255, 255, 255, 0.8)';
        ctx.shadowBlur = 1;
        ctx.shadowOffsetX = 0.5;
        ctx.shadowOffsetY = 0.5;
        ctx.fillText(this.formatNumber(machine.height), 0, 0);
        ctx.restore();
        
        // 清除阴影
        ctx.shadowColor = 'transparent';
        ctx.shadowBlur = 0;
        ctx.shadowOffsetX = 0;
        ctx.shadowOffsetY = 0;
        
        ctx.restore();
    }

    // 格式化数字，去掉不必要的尾随零
    formatNumber(value) {
        return parseFloat(value.toFixed(2)).toString();
    }

    // 计算实际长宽（所有机器占据的范围）
    calculateActualDimensions() {
        if (this.machines.length === 0) {
            return { width: 0, height: 0, minX: 0, minY: 0, maxX: 0, maxY: 0 };
        }
        
        let minX = Infinity;
        let minY = Infinity;
        let maxX = -Infinity;
        let maxY = -Infinity;
        
        this.machines.forEach(machine => {
            minX = Math.min(minX, machine.x);
            minY = Math.min(minY, machine.y);
            maxX = Math.max(maxX, machine.x + machine.width);
            maxY = Math.max(maxY, machine.y + machine.height);
        });
        
        const actualWidth = maxX - minX;
        const actualHeight = maxY - minY;
        
        return {
            width: actualWidth,
            height: actualHeight,
            minX: minX,
            minY: minY,
            maxX: maxX,
            maxY: maxY
        };
    }
}

// 初始化应用
let planner;
document.addEventListener('DOMContentLoaded', () => {
    planner = new FactoryLayoutPlanner();
}); 