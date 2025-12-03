const express = require('express');
const { Pool } = require('pg');
const cors = require('cors');
const bodyParser = require('body-parser');
const path = require('path');
require('dotenv').config();

const app = express();
const port = process.env.PORT || 3000;

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
        console.log('Connected to PostgreSQL database');
    })
    .catch(err => {
        console.error('Database connection error:', err);
    });

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

// Root route
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// API Routes
app.get('/api/customers', async (req, res) => {
    try {
        const result = await pool.query('SELECT * FROM x_crmsystem.customers ORDER BY created_at DESC');
        console.log('Customers found:', result.rows.length);
        res.json(result.rows);
    } catch (err) {
        console.error('Database error:', err);
        res.status(500).json({ error: 'Database error: ' + err.message });
    }
});

// ✅ New optimized endpoint for getting all contacts at once
app.get('/api/customers/contacts/all', async (req, res) => {
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

app.get('/api/customers/:id', async (req, res) => {
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

app.post('/api/customers', async (req, res) => {
    const {
        company_name, location, registration_info, business_type,
        contact_names, phone_number, contact_history,
        budget, required_products, pain_points,
        contract_value, email, lead_source, sales_person, customer_status,
        search_keyword,          
        no_quotation_reason       
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
             contract_value, email, lead_source, sales_person, customer_status,
             search_keyword, no_quotation_reason)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17)
            RETURNING *`,
            [company_name, location, registration_info, business_type,
             contact_names, phone_number, contact_history,
             budget, safeRequiredProducts, pain_points,
             contract_value, email, safeLeadSource, sales_person, customer_status,
             search_keyword, no_quotation_reason]
        );
        console.log('Customer inserted successfully');
        res.json(result.rows[0]);
    } catch (err) {
        console.error('Insert error:', err);
        res.status(500).json({ error: 'Database error: ' + err.message });
    }
});

app.put('/api/customers/:id', async (req, res) => {
    const customerId = req.params.id;
    const {
        company_name, location, registration_info, business_type,
        contact_names, phone_number, contact_history,
        budget, required_products, pain_points,
        contract_value, email, lead_source, sales_person, customer_status,
        search_keyword,            // ✅ ใหม่
        no_quotation_reason        // ✅ ใหม่
    } = req.body;

    try {
        console.log('Updating customer:', customerId);
        const result = await pool.query(
            `UPDATE x_crmsystem.customers 
            SET company_name = $1, location = $2, registration_info = $3, business_type = $4, 
                contact_names = $5, phone_number = $6, contact_history = $7, budget = $8, 
                required_products = $9, pain_points = $10, contract_value = $11, 
                email = $12, lead_source = $13, sales_person = $14, customer_status = $15,
                search_keyword = $16, no_quotation_reason = $17,
                updated_at = CURRENT_TIMESTAMP
            WHERE id = $18
            RETURNING *`,
            [company_name, location, registration_info, business_type,
             contact_names, phone_number, contact_history, budget,
             required_products, pain_points, contract_value,
             email, lead_source, sales_person, customer_status,
             search_keyword, no_quotation_reason,
             customerId]
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

app.delete('/api/customers/:id', async (req, res) => {
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

// Tasks API routes
app.get('/api/tasks', async (req, res) => {
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

app.get('/api/tasks/dashboard', async (req, res) => {
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
app.get('/api/tasks/:id', async (req, res) => {
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

// ✅ POST endpoint สำหรับสร้าง Task ใหม่
app.post('/api/customers/:id/tasks', async (req, res) => {
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

app.put('/api/tasks/:id', async (req, res) => {
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

// Contact logs API routes
app.get('/api/customers/:id/contacts', async (req, res) => {
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
app.get('/api/contacts/:id', async (req, res) => {
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
app.put('/api/contacts/:id', async (req, res) => {
    const contactId = req.params.id;
    const {
        contact_type, contact_status, contact_method, contact_person,
        contact_details, next_follow_up, notes, contact_date,
        quotation_status, quotation_amount
    } = req.body;

    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        console.log('Starting contact update for ID:', contactId);

        // ✅ ตรวจสอบว่า contact มีอยู่จริง
        const checkResult = await client.query(
            'SELECT * FROM x_crmsystem.contact_logs WHERE id = $1',
            [contactId]
        );
        
        if (checkResult.rows.length === 0) {
            await client.query('ROLLBACK');
            return res.status(404).json({ error: 'Contact not found' });
        }

        const existingContact = checkResult.rows[0];
        console.log('Existing contact found:', existingContact.customer_id);

        // ✅ ปรับปรุงการจัดการเวลาสำหรับการอัพเดต
        let contactDateTime = contact_date;
        if (!contactDateTime) {
            contactDateTime = existingContact.contact_date; // ใช้เวลาเดิม
        }

        // ✅ อัพเดต contact log
        const contactResult = await client.query(
            `UPDATE x_crmsystem.contact_logs 
            SET contact_type = $1, contact_status = $2, contact_method = $3, 
                contact_person = $4, contact_details = $5, next_follow_up = $6, 
                notes = $7, contact_date = $8, quotation_status = $9, 
                quotation_amount = $10, updated_at = NOW()
            WHERE id = $11
            RETURNING *`,
            [contact_type, contact_status, contact_method, contact_person,
             contact_details, next_follow_up || null, notes, contactDateTime, 
             quotation_status, quotation_amount ? parseFloat(quotation_amount) : null, 
             contactId]
        );
        
        const updatedContact = contactResult.rows[0];
        console.log('Contact updated successfully');

        // ✅ อัพเดต contract_value ถ้ามี quotation_amount
        if (quotation_amount && parseFloat(quotation_amount) > 0) {
            await client.query(
                `UPDATE x_crmsystem.customers 
                SET contract_value = $1, updated_at = NOW()
                WHERE id = $2`,
                [parseFloat(quotation_amount), updatedContact.customer_id]
            );
            console.log(`Updated contract_value for customer ${updatedContact.customer_id}`);
        }

        await client.query('COMMIT');
        res.json(updatedContact);
        
    } catch (err) {
        await client.query('ROLLBACK');
        console.error('Update contact error:', err);
        console.error('Error stack:', err.stack);
        res.status(500).json({ 
            error: 'Failed to update contact: ' + err.message,
            details: process.env.NODE_ENV === 'development' ? err.stack : undefined
        });
    } finally {
        client.release();
        console.log('Database connection released');
    }
});

// Delete contact
app.delete('/api/contacts/:id', async (req, res) => {
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
app.post('/api/customers/:id/contacts', async (req, res) => {
    const customerId = req.params.id;
    const {
        contact_type, contact_status, contact_method, contact_person,
        contact_details, next_follow_up, notes, created_by, customer_status_update, 
        contact_date, quotation_status, quotation_amount
    } = req.body;

    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        console.log('Starting contact creation for customer:', customerId);
        
        // ✅ ตรวจสอบว่า customer มีอยู่จริง
        const customerCheck = await client.query(
            'SELECT id FROM x_crmsystem.customers WHERE id = $1',
            [customerId]
        );
        
        if (customerCheck.rows.length === 0) {
            await client.query('ROLLBACK');
            return res.status(404).json({ error: 'Customer not found' });
        }
        
        // ✅ จัดการเวลาอย่างง่าย
        let contactDateTime;
        if (contact_date && contact_date !== '') {
            contactDateTime = contact_date;
        } else {
            contactDateTime = new Date().toISOString();
        }

        // ✅ ตรวจสอบข้อมูลที่จำเป็น
        if (!contact_type || !contact_status || !quotation_status) {
            await client.query('ROLLBACK');
            return res.status(400).json({ 
                error: 'ข้อมูลไม่ครบถ้วน: contact_type, contact_status, quotation_status เป็นข้อมูลที่จำเป็น' 
            });
        }

        console.log('Inserting contact with data:', {
            customerId, contact_type, contact_status, quotation_status, contactDateTime
        });

        // ✅ บันทึก contact log โดยไม่ระบุ id (ให้ sequence จัดการ)
        const contactResult = await client.query(
            `INSERT INTO x_crmsystem.contact_logs 
            (customer_id, contact_type, contact_status, contact_method, contact_person,
             contact_details, next_follow_up, notes, created_by, contact_date,
             quotation_status, quotation_amount, created_at, updated_at)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, NOW(), NOW())
            RETURNING *`,
            [
                parseInt(customerId), 
                contact_type, 
                contact_status, 
                contact_method || null, 
                contact_person || null,
                contact_details || null, 
                next_follow_up || null, 
                notes || null, 
                created_by || 'Admin', 
                contactDateTime,
                quotation_status, 
                quotation_amount ? parseFloat(quotation_amount) : null
            ]
        );

        const savedContact = contactResult.rows[0];
        console.log('✅ Contact saved successfully with ID:', savedContact.id);

        // Update customer status if provided
        if (customer_status_update) {
            await client.query(
                `UPDATE x_crmsystem.customers 
                SET customer_status = $1, updated_at = CURRENT_TIMESTAMP
                WHERE id = $2`,
                [customer_status_update, customerId]
            );
            console.log('✅ Updated customer status to:', customer_status_update);
        }

        // ✅ อัพเดต contract_value ถ้ามี quotation_amount
        if (quotation_amount && parseFloat(quotation_amount) > 0) {
            await client.query(
                `UPDATE x_crmsystem.customers 
                SET contract_value = $1, updated_at = CURRENT_TIMESTAMP
                WHERE id = $2`,
                [parseFloat(quotation_amount), customerId]
            );
            console.log(`Updated contract_value for customer ${customerId} to ${quotation_amount}`);
        }

        await client.query('COMMIT');
        console.log('✅ Transaction completed successfully');
        
        res.status(201).json({
            success: true,
            message: 'บันทึกการติดต่อเรียบร้อยแล้ว',
            data: savedContact
        });
        
    } catch (err) {
        await client.query('ROLLBACK');
        console.error('❌ Contact creation error:', err);
        
        // ✅ ตรวจสอบประเภท error เฉพาะ
        if (err.code === '23505') { // Unique constraint violation
            console.error('Duplicate key error - this should not happen with proper sequence');
            res.status(409).json({ 
                error: 'เกิดข้อผิดพลาดการซ้ำซ้อนของข้อมูล กรุณาลองใหม่อีกครั้ง',
                code: 'DUPLICATE_KEY'
            });
        } else if (err.code === '23503') { // Foreign key violation
            res.status(400).json({ 
                error: 'ไม่พบข้อมูลลูกค้าที่ระบุ',
                code: 'FOREIGN_KEY_VIOLATION'
            });
        } else {
            res.status(500).json({ 
                error: 'เกิดข้อผิดพลาดในการบันทึกข้อมูล: ' + err.message,
                code: err.code,
                details: process.env.NODE_ENV === 'development' ? err.stack : undefined
            });
        }
    } finally {
        client.release();
        console.log('Database connection released');
    }
});

// Health check endpoint
app.get('/api/health', (req, res) => {
    res.json({ 
        status: 'OK', 
        timestamp: new Date().toISOString(),
        version: '2.0.0' // Updated version with Contact Logs fix
    });
});

// Database info endpoint
app.get('/api/info', async (req, res) => {
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

// Statistics endpoint
app.get('/api/stats', async (req, res) => {
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

// ✅ เพิ่ม endpoint สำหรับแก้ไข sequence (ใช้เมื่อจำเป็น)
app.post('/api/admin/fix-contact-sequence', async (req, res) => {
    try {
        console.log('🔧 Fixing contact_logs sequence...');
        
        // หา ID สูงสุดปัจจุบัน
        const maxIdResult = await pool.query(
            'SELECT COALESCE(MAX(id), 0) as max_id FROM x_crmsystem.contact_logs'
        );
        const maxId = maxIdResult.rows[0].max_id;
        
        // ตั้งค่า sequence ให้ตรงกับค่าสูงสุด
        await pool.query(
            "SELECT setval('x_crmsystem.contact_logs_id_seq', $1, true)",
            [Math.max(maxId, 1)]
        );
        
        console.log('✅ Sequence fixed, next ID will be:', maxId + 1);
        
        res.json({
            success: true,
            message: 'แก้ไข sequence เรียบร้อยแล้ว',
            max_id: maxId,
            next_id: maxId + 1
        });
        
    } catch (error) {
        console.error('❌ Error fixing sequence:', error);
        res.status(500).json({
            error: 'ไม่สามารถแก้ไข sequence ได้: ' + error.message
        });
    }
});

// ✅ เพิ่มข้อมูลเพิ่มเติมใน test database endpoint
app.get('/api/test/database', async (req, res) => {
    try {
        console.log('Testing database connection...');
        
        // ทดสอบการเชื่อมต่อ
        const testConnection = await pool.query('SELECT NOW() as current_time');
        
        // ตรวจสอบ table structure
        const tableInfo = await pool.query(`
            SELECT 
                column_name, 
                data_type, 
                column_default, 
                is_nullable
            FROM information_schema.columns 
            WHERE table_schema = 'x_crmsystem' 
            AND table_name = 'contact_logs'
            ORDER BY ordinal_position
        `);
        
        // ตรวจสอบ sequence
        const sequenceInfo = await pool.query(`
            SELECT 
                sequence_name,
                start_value,
                increment,
                max_value,
                min_value,
                last_value
            FROM information_schema.sequences 
            WHERE sequence_schema = 'x_crmsystem'
            AND sequence_name = 'contact_logs_id_seq'
        `);
        
        // หา ID สูงสุด
        const maxIdResult = await pool.query(
            'SELECT COALESCE(MAX(id), 0) as max_id FROM x_crmsystem.contact_logs'
        );
        
        // นับจำนวน records
        const countResult = await pool.query('SELECT COUNT(*) FROM x_crmsystem.contact_logs');
        
        res.json({
            status: 'OK',
            database_time: testConnection.rows[0].current_time,
            table_structure: tableInfo.rows,
            sequence_info: sequenceInfo.rows,
            max_contact_id: parseInt(maxIdResult.rows[0].max_id),
            total_contact_logs: parseInt(countResult.rows[0].count),
            connection_config: {
                host: process.env.DB_HOST,
                database: process.env.DB_NAME,
                port: process.env.DB_PORT,
                schema: 'x_crmsystem'
            }
        });
        
    } catch (error) {
        console.error('Database test error:', error);
        res.status(500).json({
            status: 'ERROR',
            error: error.message,
            code: error.code,
            stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
        });
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
        console.log(`Server running at http://localhost:${port}`);
        console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
        console.log('CRM System v2.0.0 - Contact Logs Sequence Fixed');
    });
}