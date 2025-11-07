const express = require('express');
const { Pool } = require('pg');
const cors = require('cors');
const bodyParser = require('body-parser');
const path = require('path');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
require('dotenv').config();

const app = express();
const port = process.env.PORT || 3000;

// ✅ เพิ่ม JWT Secret
const JWT_SECRET = process.env.JWT_SECRET || 'your-super-secret-key-change-in-production';
const JWT_EXPIRES_IN = '1h';

app.use(cors());
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

// Database configuration with SSL for production
const pool = new Pool({
    user: process.env.DB_USER,
    host: process.env.DB_HOST,
    database: process.env.DB_NAME,
    password: process.env.DB_PASSWORD,
    port: process.env.DB_PORT || 5432,
    ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
    connectionTimeoutMillis: 5000,
    idleTimeoutMillis: 10000,
    max: 10
});

// Test database connection
pool.connect()
    .then(() => {
        console.log('🎉 Connected to PostgreSQL database');
        console.log(`📊 Database: ${process.env.DB_NAME} on ${process.env.DB_HOST}:${process.env.DB_PORT}`);
        // ✅ สร้างตาราง users หากยังไม่มี
        createUsersTableIfNotExists();
    })
    .catch(err => {
        console.error('💥 Database connection error:', err);
        console.error('🔧 Check your .env file and database settings');
    });

// ✅ สร้างตาราง users และ default users
async function createUsersTableIfNotExists() {
    try {
        console.log('🔧 Creating users table if not exists...');
        
        // สร้างตาราง users
        await pool.query(`
            CREATE TABLE IF NOT EXISTS x_crmsystem.users (
                id SERIAL PRIMARY KEY,
                username VARCHAR(50) UNIQUE NOT NULL,
                password_hash VARCHAR(255) NOT NULL,
                full_name VARCHAR(100) NOT NULL,
                email VARCHAR(100),
                role VARCHAR(20) DEFAULT 'user',
                is_active BOOLEAN DEFAULT true,
                last_login TIMESTAMP,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);
        console.log('✅ Users table created/verified');

        // ตรวจสอบว่ามี users อยู่หรือไม่
        const userCount = await pool.query('SELECT COUNT(*) FROM x_crmsystem.users');
        console.log('👥 Existing users count:', userCount.rows[0].count);
        
        if (parseInt(userCount.rows[0].count) === 0) {
            console.log('🔧 Creating default users...');
            
            // สร้าง default users
            const defaultUsers = [
                { username: 'admin', password: 'password123', full_name: 'System Administrator', role: 'admin' },
                { username: 'puri', password: 'password123', full_name: 'Puri (Manager)', role: 'manager' },
                { username: 'aui', password: 'password123', full_name: 'Aui (Sales)', role: 'user' },
                { username: 'ink', password: 'password123', full_name: 'Ink (Sales)', role: 'user' }
            ];

            for (const user of defaultUsers) {
                console.log(`👤 Creating user: ${user.username}`);
                const hashedPassword = await bcrypt.hash(user.password, 10);
                await pool.query(
                    `INSERT INTO x_crmsystem.users (username, password_hash, full_name, role) 
                     VALUES ($1, $2, $3, $4)`,
                    [user.username, hashedPassword, user.full_name, user.role]
                );
                console.log(`✅ User created: ${user.username}`);
            }
            
            console.log('🎉 All default users created successfully');
        } else {
            console.log('👥 Users already exist, skipping creation');
        }

        // ตรวจสอบ users ที่มีอยู่
        const allUsers = await pool.query('SELECT username, role, is_active FROM x_crmsystem.users ORDER BY username');
        console.log('👥 Current users in database:');
        allUsers.rows.forEach(user => {
            console.log(`  - ${user.username} (${user.role}) ${user.is_active ? '✅' : '❌'}`);
        });

    } catch (error) {
        console.error('💥 Error creating users table:', error);
        console.error('Stack trace:', error.stack);
    }
}

// ✅ Middleware สำหรับตรวจสอบ JWT Token
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

// ✅ Authentication Routes
// 🔐 POST /api/auth/login - เข้าสู่ระบบ
app.post('/api/auth/login', async (req, res) => {
    try {
        const { username, password, rememberMe } = req.body;
        console.log('🔐 Login attempt:', { username, hasPassword: !!password });

        if (!username || !password) {
            console.log('❌ Missing credentials');
            return res.status(400).json({ error: 'กรุณากรอกชื่อผู้ใช้และรหัสผ่าน' });
        }

        // ค้นหาผู้ใช้ในฐานข้อมูล
        const userQuery = `
            SELECT id, username, password_hash, full_name, email, role, is_active
            FROM x_crmsystem.users 
            WHERE username = $1 AND is_active = true
        `;
        
        console.log('🔍 Searching for user:', username);
        const userResult = await pool.query(userQuery, [username]);
        console.log('👤 Users found:', userResult.rows.length);

        if (userResult.rows.length === 0) {
            console.log('❌ User not found');
            return res.status(401).json({ error: 'ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง' });
        }

        const user = userResult.rows[0];
        console.log('👤 User found:', { id: user.id, username: user.username, role: user.role });

        // ตรวจสอบรหัสผ่าน
        console.log('🔐 Comparing password...');
        const passwordMatch = await bcrypt.compare(password, user.password_hash);
        console.log('🔐 Password match:', passwordMatch);

        if (!passwordMatch) {
            console.log('❌ Password mismatch');
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
app.post('/api/auth/validate', authenticateToken, async (req, res) => {
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
app.post('/api/auth/logout', authenticateToken, async (req, res) => {
    try {
        // ในระบบที่ซับซ้อนกว่านี้ อาจจะต้องเพิ่ม token ลงใน blacklist
        // แต่สำหรับระบบนี้ เราจะให้ client ลบ token เอง
        res.json({ message: 'ออกจากระบบสำเร็จ' });
    } catch (error) {
        console.error('Logout error:', error);
        res.status(500).json({ error: 'เกิดข้อผิดพลาดภายในเซิร์ฟเวอร์' });
    }
});

// ✅ Protected Routes - เพิ่ม authenticateToken middleware ให้ API routes ที่สำคัญ

// Helper function to update contract_value when quotation_amount is provided
async function updateContractValueFromQuotation(customerId, quotationAmount) {
    if (quotationAmount && quotationAmount > 0) {
        try {
            await pool.query(
                `UPDATE x_crmsystem.customers 
                SET contract_value = $1, updated_at = CURRENT_TIMESTAMP
                WHERE id = $2`,
                [quotationAmount, customerId]
            );
            console.log(`Updated contract_value for customer ${customerId} to ${quotationAmount}`);
        } catch (err) {
            console.error('Error updating contract_value:', err);
            throw err;
        }
    }
}

// Root route - ไม่ต้องป้องกัน
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// ✅ Protected API Routes - เพิ่ม authenticateToken
app.get('/api/customers', authenticateToken, async (req, res) => {
    try {
        const result = await pool.query('SELECT * FROM x_crmsystem.customers ORDER BY created_at DESC');
        console.log('Customers found:', result.rows.length);
        res.json(result.rows);
    } catch (err) {
        console.error('Database error:', err);
        res.status(500).json({ error: 'Database error: ' + err.message });
    }
});

// ✅ Protected: New optimized endpoint for getting all contacts at once
app.get('/api/customers/contacts/all', authenticateToken, async (req, res) => {
    try {
        const result = await pool.query(`
            SELECT customer_id, id, contact_date, quotation_status, quotation_amount 
            FROM x_crmsystem.contact_logs 
            WHERE quotation_status IS NOT NULL 
            ORDER BY customer_id, contact_date DESC
        `);
        console.log('All contacts found:', result.rows.length);
        res.json(result.rows);
    } catch (err) {
        console.error('Database error:', err);
        res.status(500).json({ error: 'Database error: ' + err.message });
    }
});

app.get('/api/customers/:id', authenticateToken, async (req, res) => {
    const customerId = req.params.id;
    try {
        const result = await pool.query('SELECT * FROM x_crmsystem.customers WHERE id = $1', [customerId]);
        if (result.rows.length === 0) {
            res.status(404).json({ error: 'Customer not found' });
        } else {
            res.json(result.rows[0]);
        }
    } catch (err) {
        console.error('Database error:', err);
        res.status(500).json({ error: 'Database error: ' + err.message });
    }
});

app.post('/api/customers', authenticateToken, async (req, res) => {
    const {
        company_name, location, registration_info, business_type,
        contact_names, phone_number, contact_history,
        budget, required_products, pain_points,
        contract_value, email, lead_source, sales_person, customer_status
    } = req.body;

    try {
        console.log('Inserting customer:', company_name);
        
        // ✅ เพิ่มการตรวจสอบและกำหนดค่า default
        const safeLeadSource = lead_source && lead_source !== 'เลือกแหล่งที่มา' ? lead_source : 'Online';
        const safeRequiredProducts = required_products && required_products !== 'เลือกผลิตภัณฑ์' ? required_products : 'ไม่ระบุ';
        
        const result = await pool.query(
            `INSERT INTO x_crmsystem.customers 
            (company_name, location, registration_info, business_type,
             contact_names, phone_number, contact_history,
             budget, required_products, pain_points,
             contract_value, email, lead_source, sales_person, customer_status)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
            RETURNING *`,
            [company_name, location, registration_info, business_type,
             contact_names, phone_number, contact_history,
             budget, safeRequiredProducts, pain_points,
             contract_value, email, safeLeadSource, sales_person, customer_status]
        );
        console.log('Customer inserted successfully');
        res.json(result.rows[0]);
    } catch (err) {
        console.error('Insert error:', err);
        res.status(500).json({ error: 'Database error: ' + err.message });
    }
});

app.put('/api/customers/:id', authenticateToken, async (req, res) => {
    const customerId = req.params.id;
    const {
        company_name, location, registration_info, business_type,
        contact_names, phone_number, contact_history,
        budget, required_products, pain_points,
        contract_value, email, lead_source, sales_person, customer_status
    } = req.body;

    try {
        console.log('Updating customer:', customerId);
        const result = await pool.query(
            `UPDATE x_crmsystem.customers 
            SET company_name = $1, location = $2, registration_info = $3, business_type = $4, 
                contact_names = $5, phone_number = $6, contact_history = $7, budget = $8, 
                required_products = $9, pain_points = $10, contract_value = $11, 
                email = $12, lead_source = $13, sales_person = $14, customer_status = $15,
                updated_at = CURRENT_TIMESTAMP
            WHERE id = $16
            RETURNING *`,
            [company_name, location, registration_info, business_type,
             contact_names, phone_number, contact_history, budget,
             required_products, pain_points, contract_value,
             email, lead_source, sales_person, customer_status, customerId]
        );
        
        if (result.rows.length === 0) {
            res.status(404).json({ error: 'Customer not found' });
        } else {
            console.log('Customer updated successfully');
            res.json(result.rows[0]);
        }
    } catch (err) {
        console.error('Update error:', err);
        res.status(500).json({ error: 'Database error: ' + err.message });
    }
});

app.delete('/api/customers/:id', authenticateToken, async (req, res) => {
    const customerId = req.params.id;
    try {
        console.log('Deleting customer:', customerId);
        const result = await pool.query('DELETE FROM x_crmsystem.customers WHERE id = $1 RETURNING *', [customerId]);
        
        if (result.rows.length === 0) {
            res.status(404).json({ error: 'Customer not found' });
        } else {
            console.log('Customer deleted successfully');
            res.json({ message: 'Customer deleted successfully' });
        }
    } catch (err) {
        console.error('Delete error:', err);
        res.status(500).json({ error: 'Database error: ' + err.message });
    }
});

// ✅ Protected Tasks API routes
app.get('/api/tasks', authenticateToken, async (req, res) => {
    try {
        const result = await pool.query(`
            SELECT t.*, c.company_name 
            FROM x_crmsystem.tasks t 
            LEFT JOIN x_crmsystem.customers c ON t.customer_id = c.id 
            ORDER BY t.due_date ASC, t.priority DESC
        `);
        res.json(result.rows);
    } catch (err) {
        console.error('Tasks error:', err);
        res.status(500).json({ error: 'Failed to get tasks: ' + err.message });
    }
});

app.get('/api/tasks/dashboard', authenticateToken, async (req, res) => {
    try {
        const today = new Date().toISOString().split('T')[0];
        
        const [todayTasks, overdueTasks, urgentTasks] = await Promise.all([
            pool.query(`
                SELECT t.*, c.company_name 
                FROM x_crmsystem.tasks t 
                LEFT JOIN x_crmsystem.customers c ON t.customer_id = c.id 
                WHERE t.due_date = $1 AND t.status != 'Completed'
                ORDER BY t.priority DESC
            `, [today]),
            
            pool.query(`
                SELECT t.*, c.company_name 
                FROM x_crmsystem.tasks t 
                LEFT JOIN x_crmsystem.customers c ON t.customer_id = c.id 
                WHERE t.due_date < $1 AND t.status != 'Completed'
                ORDER BY t.due_date ASC
            `, [today]),
            
            pool.query(`
                SELECT t.*, c.company_name 
                FROM x_crmsystem.tasks t 
                LEFT JOIN x_crmsystem.customers c ON t.customer_id = c.id 
                WHERE t.priority = 'Urgent' AND t.status != 'Completed'
                ORDER BY t.due_date ASC
            `)
        ]);

        res.json({
            today: todayTasks.rows,
            overdue: overdueTasks.rows,
            urgent: urgentTasks.rows
        });
    } catch (err) {
        console.error('Dashboard tasks error:', err);
        res.status(500).json({ error: 'Failed to get dashboard tasks: ' + err.message });
    }
});

// Get single task
app.get('/api/tasks/:id', authenticateToken, async (req, res) => {
    const taskId = req.params.id;
    try {
        const result = await pool.query(`
            SELECT t.*, c.company_name 
            FROM x_crmsystem.tasks t 
            LEFT JOIN x_crmsystem.customers c ON t.customer_id = c.id 
            WHERE t.id = $1
        `, [taskId]);
        
        if (result.rows.length === 0) {
            res.status(404).json({ error: 'Task not found' });
        } else {
            res.json(result.rows[0]);
        }
    } catch (err) {
        console.error('Get task error:', err);
        res.status(500).json({ error: 'Failed to get task: ' + err.message });
    }
});

// ✅ POST endpoint สำหรับสร้าง Task ใหม่ (ที่หายไป)
app.post('/api/customers/:id/tasks', authenticateToken, async (req, res) => {
    const customerId = req.params.id;
    const {
        title, description, task_type, priority, assigned_to,
        due_date, reminder_date, created_by
    } = req.body;

    try {
        console.log('Creating task for customer:', customerId);
        const result = await pool.query(
            `INSERT INTO x_crmsystem.tasks 
            (customer_id, title, description, task_type, priority, assigned_to,
             due_date, reminder_date, created_by, status)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'Pending')
            RETURNING *`,
            [customerId, title, description, task_type, priority, assigned_to,
             due_date, reminder_date, created_by]
        );
        console.log('Task created successfully');
        res.json(result.rows[0]);
    } catch (err) {
        console.error('Create task error:', err);
        res.status(500).json({ error: 'Failed to create task: ' + err.message });
    }
});

app.put('/api/tasks/:id', authenticateToken, async (req, res) => {
    const taskId = req.params.id;
    const { status, completed_at } = req.body;

    try {
        const result = await pool.query(
            `UPDATE x_crmsystem.tasks 
            SET status = $1, completed_at = $2, updated_at = CURRENT_TIMESTAMP
            WHERE id = $3
            RETURNING *`,
            [status, completed_at, taskId]
        );
        
        if (result.rows.length === 0) {
            res.status(404).json({ error: 'Task not found' });
        } else {
            res.json(result.rows[0]);
        }
    } catch (err) {
        console.error('Update task error:', err);
        res.status(500).json({ error: 'Failed to update task: ' + err.message });
    }
});

// ✅ Protected Contact logs API routes
app.get('/api/customers/:id/contacts', authenticateToken, async (req, res) => {
    const customerId = req.params.id;
    try {
        const result = await pool.query(
            'SELECT * FROM x_crmsystem.contact_logs WHERE customer_id = $1 ORDER BY contact_date DESC', 
            [customerId]
        );
        res.json(result.rows);
    } catch (err) {
        console.error('Contact logs error:', err);
        res.status(500).json({ error: 'Failed to get contact logs: ' + err.message });
    }
});

// Get single contact
app.get('/api/contacts/:id', authenticateToken, async (req, res) => {
    const contactId = req.params.id;
    try {
        const result = await pool.query(
            'SELECT * FROM x_crmsystem.contact_logs WHERE id = $1', 
            [contactId]
        );
        if (result.rows.length === 0) {
            res.status(404).json({ error: 'Contact not found' });
        } else {
            res.json(result.rows[0]);
        }
    } catch (err) {
        console.error('Contact error:', err);
        res.status(500).json({ error: 'Failed to get contact: ' + err.message });
    }
});

// ✅ Update contact - แก้ไขให้รองรับ quotation_status และ quotation_amount พร้อมอัพเดต contract_value
app.put('/api/contacts/:id', authenticateToken, async (req, res) => {
    const contactId = req.params.id;
    const {
        contact_type, contact_status, contact_method, contact_person,
        contact_details, next_follow_up, notes, contact_date,
        quotation_status, quotation_amount
    } = req.body;

    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        // Update contact log
        const contactResult = await client.query(
            `UPDATE x_crmsystem.contact_logs 
            SET contact_type = $1, contact_status = $2, contact_method = $3, 
                contact_person = $4, contact_details = $5, next_follow_up = $6, 
                notes = $7, contact_date = $8, quotation_status = $9, 
                quotation_amount = $10, updated_at = CURRENT_TIMESTAMP
            WHERE id = $11
            RETURNING *`,
            [contact_type, contact_status, contact_method, contact_person,
             contact_details, next_follow_up, notes, contact_date, 
             quotation_status, quotation_amount, contactId]
        );
        
        if (contactResult.rows.length === 0) {
            await client.query('ROLLBACK');
            return res.status(404).json({ error: 'Contact not found' });
        }

        const contact = contactResult.rows[0];

        // ✅ อัพเดต contract_value ถ้ามี quotation_amount
        if (quotation_amount && quotation_amount > 0) {
            await client.query(
                `UPDATE x_crmsystem.customers 
                SET contract_value = $1, updated_at = CURRENT_TIMESTAMP
                WHERE id = $2`,
                [quotation_amount, contact.customer_id]
            );
            console.log(`Updated contract_value for customer ${contact.customer_id} to ${quotation_amount} from contact update`);
        }

        await client.query('COMMIT');
        res.json(contact);
    } catch (err) {
        await client.query('ROLLBACK');
        console.error('Update contact error:', err);
        res.status(500).json({ error: 'Failed to update contact: ' + err.message });
    } finally {
        client.release();
    }
});

// Delete contact
app.delete('/api/contacts/:id', authenticateToken, async (req, res) => {
    const contactId = req.params.id;
    try {
        const result = await pool.query(
            'DELETE FROM x_crmsystem.contact_logs WHERE id = $1 RETURNING *', 
            [contactId]
        );
        
        if (result.rows.length === 0) {
            res.status(404).json({ error: 'Contact not found' });
        } else {
            res.json({ message: 'Contact deleted successfully' });
        }
    } catch (err) {
        console.error('Delete contact error:', err);
        res.status(500).json({ error: 'Failed to delete contact: ' + err.message });
    }
});

// ✅ แก้ไขการจัดการเวลาในการบันทึกการติดต่อ - รองรับ quotation_status และ quotation_amount พร้อมอัพเดต contract_value
app.post('/api/customers/:id/contacts', authenticateToken, async (req, res) => {
    const customerId = req.params.id;
    const {
        contact_type, contact_status, contact_method, contact_person,
        contact_details, next_follow_up, notes, created_by, customer_status_update, 
        contact_date, quotation_status, quotation_amount
    } = req.body;

    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        // รับค่า contact_date ที่ส่งมาจาก frontend 
        // ค่านี้เป็น UTC timestamp ที่แทนค่าเวลาท้องถิ่นที่ user เลือก
        let contactDateTime;
        if (contact_date) {
            // ใช้ค่าที่ส่งมาโดยตรง (ไม่แปลง timezone เพิ่ม)
            contactDateTime = contact_date;
        } else {
            // ถ้าไม่มีค่าส่งมา ใช้เวลาปัจจุบัน
            const now = new Date();
            const timezoneOffset = now.getTimezoneOffset() * 60000;
            contactDateTime = new Date(now.getTime() - timezoneOffset).toISOString();
        }

        console.log('Original contact_date from frontend:', contact_date);
        console.log('Final contactDateTime for database:', contactDateTime);

        // Add contact log with quotation information
        const contactResult = await client.query(
            `INSERT INTO x_crmsystem.contact_logs 
            (customer_id, contact_type, contact_status, contact_method, contact_person,
             contact_details, next_follow_up, notes, created_by, contact_date,
             quotation_status, quotation_amount)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
            RETURNING *`,
            [customerId, contact_type, contact_status, contact_method, contact_person,
             contact_details, next_follow_up, notes, created_by, contactDateTime,
             quotation_status, quotation_amount]
        );

        console.log('Contact log saved with date:', contactResult.rows[0].contact_date);
        console.log('Quotation status saved:', contactResult.rows[0].quotation_status);
        console.log('Quotation amount saved:', contactResult.rows[0].quotation_amount);

        // Update customer status if provided
        if (customer_status_update) {
            await client.query(
                `UPDATE x_crmsystem.customers 
                SET customer_status = $1, updated_at = CURRENT_TIMESTAMP
                WHERE id = $2`,
                [customer_status_update, customerId]
            );
        }

        // ✅ อัพเดต contract_value ถ้ามี quotation_amount
        if (quotation_amount && quotation_amount > 0) {
            await client.query(
                `UPDATE x_crmsystem.customers 
                SET contract_value = $1, updated_at = CURRENT_TIMESTAMP
                WHERE id = $2`,
                [quotation_amount, customerId]
            );
            console.log(`Updated contract_value for customer ${customerId} to ${quotation_amount} from new contact`);
        }

        await client.query('COMMIT');
        res.json(contactResult.rows[0]);
    } catch (err) {
        await client.query('ROLLBACK');
        console.error('Add contact log error:', err);
        res.status(500).json({ error: 'Failed to add contact log: ' + err.message });
    } finally {
        client.release();
    }
});

// ✅ Public Routes (ไม่ต้องใส่ authenticateToken)
// Health check endpoint
app.get('/api/health', (req, res) => {
    res.json({ 
        status: 'OK', 
        timestamp: new Date().toISOString(),
        version: '2.0.0 - With Authentication System'
    });
});

// 🔧 Debug endpoint - สร้าง default users (ใช้เฉพาะตอน debug)
app.post('/api/create-default-users', async (req, res) => {
    try {
        console.log('🔧 Manual user creation requested...');
        
        // สร้างตาราง users ก่อน
        await pool.query(`
            CREATE TABLE IF NOT EXISTS x_crmsystem.users (
                id SERIAL PRIMARY KEY,
                username VARCHAR(50) UNIQUE NOT NULL,
                password_hash VARCHAR(255) NOT NULL,
                full_name VARCHAR(100) NOT NULL,
                email VARCHAR(100),
                role VARCHAR(20) DEFAULT 'user',
                is_active BOOLEAN DEFAULT true,
                last_login TIMESTAMP,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);

        // สร้าง default users
        const defaultUsers = [
            { username: 'admin', password: 'password123', full_name: 'System Administrator', role: 'admin' },
            { username: 'puri', password: 'password123', full_name: 'Puri (Manager)', role: 'manager' },
            { username: 'aui', password: 'password123', full_name: 'Aui (Sales)', role: 'user' },
            { username: 'ink', password: 'password123', full_name: 'Ink (Sales)', role: 'user' }
        ];

        const results = [];
        for (const user of defaultUsers) {
            try {
                const hashedPassword = await bcrypt.hash(user.password, 10);
                await pool.query(
                    `INSERT INTO x_crmsystem.users (username, password_hash, full_name, role) 
                     VALUES ($1, $2, $3, $4)`,
                    [user.username, hashedPassword, user.full_name, user.role]
                );
                results.push(`✅ Created: ${user.username}`);
            } catch (err) {
                if (err.code === '23505') { // Duplicate key error
                    results.push(`⚠️ Exists: ${user.username}`);
                } else {
                    results.push(`❌ Error creating ${user.username}: ${err.message}`);
                }
            }
        }

        // ตรวจสอบ users ที่มี
        const allUsers = await pool.query('SELECT username, role, is_active, created_at FROM x_crmsystem.users ORDER BY username');
        
        res.json({
            message: 'User creation completed',
            results: results,
            current_users: allUsers.rows
        });

    } catch (error) {
        console.error('Error creating users:', error);
        res.status(500).json({ 
            error: 'Failed to create users',
            details: error.message
        });
    }
});

// 🔧 Debug endpoint - สร้าง user ใหม่ (ใช้เฉพาะตอน debug)
app.post('/api/auth/register', async (req, res) => {
    try {
        const { username, password, full_name, role = 'user' } = req.body;
        
        if (!username || !password || !full_name) {
            return res.status(400).json({ error: 'Missing required fields' });
        }

        const hashedPassword = await bcrypt.hash(password, 10);
        
        const result = await pool.query(
            `INSERT INTO x_crmsystem.users (username, password_hash, full_name, role) 
             VALUES ($1, $2, $3, $4) RETURNING id, username, full_name, role`,
            [username, hashedPassword, full_name, role]
        );

        res.json({
            message: 'User created successfully',
            user: result.rows[0]
        });

    } catch (error) {
        if (error.code === '23505') { // Duplicate key
            res.status(400).json({ error: 'Username already exists' });
        } else {
            console.error('Register error:', error);
            res.status(500).json({ error: 'Failed to create user' });
        }
    }
});

// 🔍 Debug endpoint - ดู users ที่มี
app.get('/api/debug-users', async (req, res) => {
    try {
        const users = await pool.query('SELECT id, username, full_name, role, is_active, created_at FROM x_crmsystem.users ORDER BY username');
        const userCount = await pool.query('SELECT COUNT(*) FROM x_crmsystem.users');
        
        res.json({
            total_users: parseInt(userCount.rows[0].count),
            users: users.rows
        });
    } catch (error) {
        res.status(500).json({ 
            error: 'Database error', 
            details: error.message 
        });
    }
});

// Database info endpoint - เปลี่ยนเป็น protected
app.get('/api/info', authenticateToken, async (req, res) => {
    try {
        const [customersCount, tasksCount, contactsCount] = await Promise.all([
            pool.query('SELECT COUNT(*) FROM x_crmsystem.customers'),
            pool.query('SELECT COUNT(*) FROM x_crmsystem.tasks'),
            pool.query('SELECT COUNT(*) FROM x_crmsystem.contact_logs')
        ]);

        res.json({
            customers: parseInt(customersCount.rows[0].count),
            tasks: parseInt(tasksCount.rows[0].count),
            contacts: parseInt(contactsCount.rows[0].count),
            timestamp: new Date().toISOString()
        });
    } catch (err) {
        console.error('Info error:', err);
        res.status(500).json({ error: 'Failed to get info: ' + err.message });
    }
});

// Statistics endpoint - เปลี่ยนเป็น protected
app.get('/api/stats', authenticateToken, async (req, res) => {
    try {
        const [
            totalCustomers,
            onlineLeads,
            offlineLeads,
            highValueCustomers,
            recentCustomers,
            taskStats,
            statusStats
        ] = await Promise.all([
            pool.query('SELECT COUNT(*) FROM x_crmsystem.customers'),
            pool.query("SELECT COUNT(*) FROM x_crmsystem.customers WHERE lead_source = 'Online'"),
            pool.query("SELECT COUNT(*) FROM x_crmsystem.customers WHERE lead_source = 'Offline'"),
            pool.query('SELECT COUNT(*) FROM x_crmsystem.customers WHERE contract_value > 100000'),
            pool.query('SELECT COUNT(*) FROM x_crmsystem.customers WHERE created_at >= NOW() - INTERVAL \'7 days\''),
            pool.query(`
                SELECT 
                    status,
                    COUNT(*) as count
                FROM x_crmsystem.tasks 
                GROUP BY status
            `),
            pool.query(`
                SELECT 
                    customer_status,
                    COUNT(*) as count
                FROM x_crmsystem.customers 
                WHERE customer_status IS NOT NULL
                GROUP BY customer_status
            `)
        ]);

        const taskStatsObj = {};
        taskStats.rows.forEach(row => {
            taskStatsObj[row.status] = parseInt(row.count);
        });

        const statusStatsObj = {};
        statusStats.rows.forEach(row => {
            statusStatsObj[row.customer_status] = parseInt(row.count);
        });

        res.json({
            customers: {
                total: parseInt(totalCustomers.rows[0].count),
                online_leads: parseInt(onlineLeads.rows[0].count),
                offline_leads: parseInt(offlineLeads.rows[0].count),
                high_value: parseInt(highValueCustomers.rows[0].count),
                recent: parseInt(recentCustomers.rows[0].count),
                by_status: statusStatsObj
            },
            tasks: taskStatsObj,
            timestamp: new Date().toISOString()
        });
    } catch (err) {
        console.error('Stats error:', err);
        res.status(500).json({ error: 'Failed to get stats: ' + err.message });
    }
});

// Error handling middleware
app.use((error, req, res, next) => {
    console.error('Unhandled error:', error);
    res.status(500).json({ 
        error: 'Internal server error',
        message: process.env.NODE_ENV === 'development' ? error.message : 'Something went wrong'
    });
});

// 404 handler for API routes
app.use('/api/*', (req, res) => {
    res.status(404).json({ error: 'API endpoint not found' });
});

// Handle all other routes for SPA
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Export app for Vercel
module.exports = app;

// Only listen when running locally
if (require.main === module) {
    app.listen(port, () => {
        console.log(`🚀 Server running at http://localhost:${port}`);
        console.log(`🔐 Environment: ${process.env.NODE_ENV || 'development'}`);
        console.log('✅ CRM System v2.0.0 - With Authentication System');
        console.log('🔑 Default users created: admin, puri, aui, ink (password: password123)');
    });
}