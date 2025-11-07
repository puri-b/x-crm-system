// 🔐 Authentication System for SONEXT CRM
// ระบบตรวจสอบสิทธิ์การเข้าใช้งาน

class AuthManager {
    constructor() {
        this.token = null;
        this.user = null;
        this.refreshInterval = null;
        this.init();
    }

    init() {
        this.loadStoredAuth();
        this.setupTokenRefresh();
    }

    // โหลดข้อมูลการเข้าสู่ระบบจาก localStorage
    loadStoredAuth() {
        const token = localStorage.getItem('authToken');
        const userData = localStorage.getItem('userData');
        
        if (token && userData) {
            this.token = token;
            try {
                this.user = JSON.parse(userData);
            } catch (error) {
                console.error('Error parsing user data:', error);
                this.clearAuth();
            }
        }
    }

    // ตรวจสอบสิทธิ์การเข้าถึง
    async checkAuth() {
        const currentPath = window.location.pathname;
        const isLoginPage = currentPath.includes('login.html');
        
        // ถ้าอยู่ในหน้า login และมี token ที่ใช้งานได้
        if (isLoginPage && this.token) {
            const isValid = await this.validateToken();
            if (isValid) {
                window.location.href = 'index.html';
                return;
            }
        }
        
        // ถ้าไม่ได้อยู่ในหน้า login และไม่มี token
        if (!isLoginPage && !this.token) {
            this.redirectToLogin();
            return;
        }
        
        // ถ้ามี token ให้ตรวจสอบความถูกต้อง
        if (this.token && !isLoginPage) {
            const isValid = await this.validateToken();
            if (!isValid) {
                this.redirectToLogin();
                return;
            }
            
            // อัพเดตข้อมูลผู้ใช้ใน UI
            this.updateUserInterface();
            this.showMainContent();
        }
    }

    // ตรวจสอบความถูกต้องของ token
    async validateToken() {
        if (!this.token) return false;
        
        try {
            const response = await fetch('/api/auth/validate', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${this.token}`
                }
            });
            
            if (response.ok) {
                const data = await response.json();
                // อัพเดตข้อมูลผู้ใช้ล่าสุด
                if (data.user) {
                    this.user = data.user;
                    localStorage.setItem('userData', JSON.stringify(this.user));
                }
                return true;
            } else {
                return false;
            }
        } catch (error) {
            console.error('Token validation error:', error);
            return false;
        }
    }

    // อัพเดตข้อมูลผู้ใช้ใน UI
    updateUserInterface() {
        if (!this.user) return;
        
        const currentUserSpan = document.getElementById('currentUser');
        const userFullNameSpan = document.getElementById('userFullName');
        const userRoleSpan = document.getElementById('userRole');
        
        if (currentUserSpan) {
            currentUserSpan.textContent = this.user.username;
        }
        
        if (userFullNameSpan) {
            userFullNameSpan.textContent = this.user.full_name;
        }
        
        if (userRoleSpan) {
            const roleText = {
                'admin': '👑 ผู้ดูแลระบบ',
                'manager': '⭐ ผู้จัดการ', 
                'user': '👤 ผู้ใช้งาน'
            };
            userRoleSpan.textContent = roleText[this.user.role] || this.user.role;
        }
    }

    // แสดงเนื้อหาหลักหลังจากตรวจสอบสิทธิ์เสร็จ
    showMainContent() {
        const loadingScreen = document.getElementById('loadingScreen');
        const mainContent = document.getElementById('mainContent');
        
        if (loadingScreen) {
            loadingScreen.style.display = 'none';
        }
        
        if (mainContent) {
            mainContent.style.display = 'block';
        }
    }

    // เปลี่ยนเส้นทางไปหน้า login
    redirectToLogin() {
        this.clearAuth();
        if (!window.location.pathname.includes('login.html')) {
            window.location.href = 'login.html';
        }
    }

    // ล้างข้อมูลการเข้าสู่ระบบ
    clearAuth() {
        this.token = null;
        this.user = null;
        localStorage.removeItem('authToken');
        localStorage.removeItem('userData');
        localStorage.removeItem('rememberLogin');
        
        if (this.refreshInterval) {
            clearInterval(this.refreshInterval);
            this.refreshInterval = null;
        }
    }

    // ตั้งค่า auto-refresh token
    setupTokenRefresh() {
        if (this.token) {
            // Refresh token ทุก 55 นาที (token หมดอายุใน 1 ชม.)
            this.refreshInterval = setInterval(async () => {
                const isValid = await this.validateToken();
                if (!isValid && !window.location.pathname.includes('login.html')) {
                    this.redirectToLogin();
                }
            }, 55 * 60 * 1000);
        }
    }

    // เข้าสู่ระบบ
    async login(username, password, rememberMe = false) {
        try {
            const response = await fetch('/api/auth/login', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    username: username,
                    password: password,
                    rememberMe: rememberMe
                })
            });

            const data = await response.json();

            if (response.ok) {
                this.token = data.token;
                this.user = data.user;
                
                localStorage.setItem('authToken', this.token);
                localStorage.setItem('userData', JSON.stringify(this.user));
                
                if (rememberMe) {
                    localStorage.setItem('rememberLogin', 'true');
                }
                
                this.setupTokenRefresh();
                return { success: true, user: this.user };
            } else {
                return { success: false, error: data.error || 'ข้อมูลไม่ถูกต้อง' };
            }
        } catch (error) {
            console.error('Login error:', error);
            return { success: false, error: 'เกิดข้อผิดพลาดในการเชื่อมต่อ' };
        }
    }

    // ออกจากระบบ
    async logout() {
        try {
            if (this.token) {
                // แจ้งให้ server รู้ว่าออกจากระบบแล้ว
                await fetch('/api/auth/logout', {
                    method: 'POST',
                    headers: {
                        'Authorization': `Bearer ${this.token}`,
                        'Content-Type': 'application/json'
                    }
                });
            }
        } catch (error) {
            console.error('Logout error:', error);
        } finally {
            this.clearAuth();
            window.location.href = 'login.html';
        }
    }

    // เปลี่ยนรหัสผ่าน
    async changePassword(oldPassword, newPassword) {
        try {
            const response = await fetch('/api/auth/change-password', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${this.token}`
                },
                body: JSON.stringify({
                    oldPassword: oldPassword,
                    newPassword: newPassword
                })
            });

            const data = await response.json();
            return { success: response.ok, message: data.message || data.error };
        } catch (error) {
            console.error('Change password error:', error);
            return { success: false, message: 'เกิดข้อผิดพลาดในการเชื่อมต่อ' };
        }
    }

    // ตรวจสอบสิทธิ์ตาม role
    hasRole(requiredRole) {
        if (!this.user) return false;
        
        const roleHierarchy = {
            'admin': 3,
            'manager': 2,
            'user': 1
        };
        
        const userLevel = roleHierarchy[this.user.role] || 0;
        const requiredLevel = roleHierarchy[requiredRole] || 0;
        
        return userLevel >= requiredLevel;
    }

    // เพิ่ม Authorization header ใน fetch requests
    getAuthHeaders() {
        return this.token ? {
            'Authorization': `Bearer ${this.token}`,
            'Content-Type': 'application/json'
        } : {
            'Content-Type': 'application/json'
        };
    }
}

// สร้าง instance ของ AuthManager
const authManager = new AuthManager();

// Global functions สำหรับใช้ใน HTML
function logout() {
    if (confirm('คุณต้องการออกจากระบบหรือไม่?')) {
        authManager.logout();
    }
}

function changePassword() {
    showChangePasswordModal();
}

function showChangePasswordModal() {
    const modalHTML = `
        <div class="modal fade" id="changePasswordModal" tabindex="-1">
            <div class="modal-dialog">
                <div class="modal-content">
                    <div class="modal-header">
                        <h5 class="modal-title">
                            <i class="bi bi-key me-2"></i>เปลี่ยนรหัสผ่าน
                        </h5>
                        <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
                    </div>
                    <div class="modal-body">
                        <form id="changePasswordForm">
                            <div class="mb-3">
                                <label class="form-label">รหัสผ่านเดิม *</label>
                                <input type="password" class="form-control" name="oldPassword" required>
                            </div>
                            <div class="mb-3">
                                <label class="form-label">รหัสผ่านใหม่ *</label>
                                <input type="password" class="form-control" name="newPassword" required minlength="6">
                                <div class="form-text">รหัสผ่านต้องมีอย่างน้อย 6 ตัวอักษร</div>
                            </div>
                            <div class="mb-3">
                                <label class="form-label">ยืนยันรหัสผ่านใหม่ *</label>
                                <input type="password" class="form-control" name="confirmPassword" required>
                            </div>
                        </form>
                    </div>
                    <div class="modal-footer">
                        <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">ยกเลิก</button>
                        <button type="button" class="btn btn-primary" onclick="submitChangePassword()">
                            <i class="bi bi-check me-1"></i>เปลี่ยนรหัสผ่าน
                        </button>
                    </div>
                </div>
            </div>
        </div>
    `;

    document.body.insertAdjacentHTML('beforeend', modalHTML);
    const modal = new bootstrap.Modal(document.getElementById('changePasswordModal'));
    modal.show();

    document.getElementById('changePasswordModal').addEventListener('hidden.bs.modal', function () {
        this.remove();
    });
}

async function submitChangePassword() {
    const form = document.getElementById('changePasswordForm');
    const formData = new FormData(form);
    
    const oldPassword = formData.get('oldPassword');
    const newPassword = formData.get('newPassword');
    const confirmPassword = formData.get('confirmPassword');
    
    if (newPassword !== confirmPassword) {
        showNotification('รหัสผ่านใหม่ไม่ตรงกัน', 'danger');
        return;
    }
    
    const result = await authManager.changePassword(oldPassword, newPassword);
    
    if (result.success) {
        showNotification('เปลี่ยนรหัสผ่านเรียบร้อยแล้ว', 'success');
        document.getElementById('changePasswordModal').querySelector('[data-bs-dismiss="modal"]').click();
    } else {
        showNotification(result.message, 'danger');
    }
}

// Override fetch function เพื่อเพิ่ม auth headers อัตโนมัติ
const originalFetch = window.fetch;
window.fetch = function(...args) {
    const [url, options = {}] = args;
    
    // เพิ่ม auth headers ถ้าเป็น API call และมี token
    if (typeof url === 'string' && url.startsWith('/api/') && authManager.token) {
        options.headers = {
            ...options.headers,
            ...authManager.getAuthHeaders()
        };
    }
    
    return originalFetch.apply(this, [url, options]);
};

// เริ่มตรวจสอบสิทธิ์เมื่อโหลดหน้าเว็บ
document.addEventListener('DOMContentLoaded', function() {
    authManager.checkAuth();
});

// Export สำหรับใช้ใน modules อื่น
window.authManager = authManager;