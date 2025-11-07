// 🚀 Backend API Endpoints สำหรับระบบ Authentication
// ตัวอย่างการสร้าง API endpoints สำหรับ Node.js + Express + PostgreSQL

const express = require('express');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const { Pool } = require('pg');

const router = express.Router();

// การตั้งค่า Database Connection
const pool = new Pool({
    user: 'your_username',
    host: 'localhost',
    database: 'your_database',
    password: 'your_password', 
    port: 5432,
});

// JWT Secret Key (ใช้ environment variable ในการใช้งานจริง)
const JWT_SECRET = process.env.JWT_SECRET || 'your-super-secret-key';
const JWT_EXPIRES_IN = '1h';

// Middleware สำหรับตรวจสอบ JWT Token
const authenticateToken = (req, res, next) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (!token) {
        return res.status(401).json({ error: 'Access token required' });
    }

    jwt.verify(token, JWT_SECRET, (err, user) => {
        if (err) {
            return res.status(403).json({ error: 'Invalid or expired token' });
        }
        req.user = user;
        next();
    });
};

// 🔐 POST /api/auth/login - เข้าสู่ระบบ
router.post('/login', async (req, res) => {
    try {
        const { username, password, rememberMe } = req.body;

        if (!username || !password) {
            return res.status(400).json({ error: 'กรุณากรอกชื่อผู้ใช้และรหัสผ่าน' });
        }

        // ค้นหาผู้ใช้ในฐานข้อมูล
        const userQuery = `
            SELECT id, username, password_hash, full_name, email, role, is_active
            FROM x_crmsystem.users 
            WHERE username = $1 AND is_active = true
        `;
        
        const userResult = await pool.query(userQuery, [username]);

        if (userResult.rows.length === 0) {
            return res.status(401).json({ error: 'ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง' });
        }

        const user = userResult.rows[0];

        // ตรวจสอบรหัสผ่าน
        const passwordMatch = await bcrypt.compare(password, user.password_hash);

        if (!passwordMatch) {
            return res.status(401).json({ error: 'ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง' });
        }

        // อัพเดต last_login
        await pool.query(
            'UPDATE x_crmsystem.users SET last_login = CURRENT_TIMESTAMP WHERE id = $1',
            [user.id]
        );

        // สร้าง JWT Token
        const tokenExpiration = rememberMe ? '7d' : JWT_EXPIRES_IN;
        const token = jwt.sign(
            { 
                id: user.id,
                username: user.username,
                role: user.role 
            },
            JWT_SECRET,
            { expiresIn: tokenExpiration }
        );

        // ส่งข้อมูลกลับ (ไม่รวมรหัสผ่าน)
        const userResponse = {
            id: user.id,
            username: user.username,
            full_name: user.full_name,
            email: user.email,
            role: user.role
        };

        res.json({
            message: 'เข้าสู่ระบบสำเร็จ',
            token: token,
            user: userResponse
        });

    } catch (error) {
        console.error('Login error:', error);
        res.status(500).json({ error: 'เกิดข้อผิดพลาดภายในเซิร์ฟเวอร์' });
    }
});

// 🔐 POST /api/auth/validate - ตรวจสอบความถูกต้องของ Token
router.post('/validate', authenticateToken, async (req, res) => {
    try {
        // ดึงข้อมูลผู้ใช้ล่าสุดจากฐานข้อมูล
        const userQuery = `
            SELECT id, username, full_name, email, role, is_active, last_login
            FROM x_crmsystem.users 
            WHERE id = $1 AND is_active = true
        `;
        
        const userResult = await pool.query(userQuery, [req.user.id]);

        if (userResult.rows.length === 0) {
            return res.status(401).json({ error: 'ผู้ใช้ไม่ถูกต้องหรือถูกระงับการใช้งาน' });
        }

        const user = userResult.rows[0];
        
        res.json({
            valid: true,
            user: {
                id: user.id,
                username: user.username,
                full_name: user.full_name,
                email: user.email,
                role: user.role,
                last_login: user.last_login
            }
        });

    } catch (error) {
        console.error('Token validation error:', error);
        res.status(500).json({ error: 'เกิดข้อผิดพลาดภายในเซิร์ฟเวอร์' });
    }
});

// 🔐 POST /api/auth/logout - ออกจากระบบ
router.post('/logout', authenticateToken, async (req, res) => {
    try {
        // ในระบบที่ซับซ้อนกว่านี้ อาจจะต้องเพิ่ม token ลงใน blacklist
        // แต่สำหรับระบบนี้ เราจะให้ client ลบ token เอง
        
        res.json({ message: 'ออกจากระบบสำเร็จ' });
    } catch (error) {
        console.error('Logout error:', error);
        res.status(500).json({ error: 'เกิดข้อผิดพลาดภายในเซิร์ฟเวอร์' });
    }
});

// 🔐 POST /api/auth/change-password - เปลี่ยนรหัสผ่าน
router.post('/change-password', authenticateToken, async (req, res) => {
    try {
        const { oldPassword, newPassword } = req.body;

        if (!oldPassword || !newPassword) {
            return res.status(400).json({ error: 'กรุณากรอกรหัสผ่านเดิมและรหัสผ่านใหม่' });
        }

        if (newPassword.length < 6) {
            return res.status(400).json({ error: 'รหัสผ่านใหม่ต้องมีอย่างน้อย 6 ตัวอักษร' });
        }

        // ดึงรหัสผ่านปัจจุบัน
        const userQuery = `
            SELECT id, password_hash 
            FROM x_crmsystem.users 
            WHERE id = $1 AND is_active = true
        `;
        
        const userResult = await pool.query(userQuery, [req.user.id]);

        if (userResult.rows.length === 0) {
            return res.status(404).json({ error: 'ไม่พบข้อมูลผู้ใช้' });
        }

        const user = userResult.rows[0];

        // ตรวจสอบรหัสผ่านเดิม
        const passwordMatch = await bcrypt.compare(oldPassword, user.password_hash);

        if (!passwordMatch) {
            return res.status(400).json({ error: 'รหัสผ่านเดิมไม่ถูกต้อง' });
        }

        // Hash รหัสผ่านใหม่
        const saltRounds = 10;
        const newPasswordHash = await bcrypt.hash(newPassword, saltRounds);

        // อัพเดตรหัสผ่านในฐานข้อมูล
        await pool.query(
            'UPDATE x_crmsystem.users SET password_hash = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2',
            [newPasswordHash, req.user.id]
        );

        res.json({ message: 'เปลี่ยนรหัสผ่านสำเร็จ' });

    } catch (error) {
        console.error('Change password error:', error);
        res.status(500).json({ error: 'เกิดข้อผิดพลาดภายในเซิร์ฟเวอร์' });
    }
});

// 🔐 GET /api/auth/profile - ดูข้อมูลโปรไฟล์
router.get('/profile', authenticateToken, async (req, res) => {
    try {
        const userQuery = `
            SELECT id, username, full_name, email, role, last_login, created_at
            FROM x_crmsystem.users 
            WHERE id = $1 AND is_active = true
        `;
        
        const userResult = await pool.query(userQuery, [req.user.id]);

        if (userResult.rows.length === 0) {
            return res.status(404).json({ error: 'ไม่พบข้อมูลผู้ใช้' });
        }

        res.json(userResult.rows[0]);

    } catch (error) {
        console.error('Get profile error:', error);
        res.status(500).json({ error: 'เกิดข้อผิดพลาดภายในเซิร์ฟเวอร์' });
    }
});

// 🔐 Middleware สำหรับตรวจสอบสิทธิ์ตาม Role
const requireRole = (roles) => {
    return (req, res, next) => {
        if (!req.user || !roles.includes(req.user.role)) {
            return res.status(403).json({ error: 'ไม่มีสิทธิ์เข้าถึงข้อมูลนี้' });
        }
        next();
    };
};

// ตัวอย่างการใช้งาน Role-based Authorization
// เฉพาะ Admin และ Manager เท่านั้นที่เห็นรายงานนี้ได้
router.get('/admin-report', authenticateToken, requireRole(['admin', 'manager']), async (req, res) => {
    try {
        // ดึงข้อมูลรายงานสำหรับ Admin/Manager
        res.json({ message: 'รายงานสำหรับผู้ดูแลระบบ' });
    } catch (error) {
        res.status(500).json({ error: 'เกิดข้อผิดพลาด' });
    }
});

module.exports = { 
    authRouter: router, 
    authenticateToken, 
    requireRole 
};