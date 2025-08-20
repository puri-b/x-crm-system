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
        contract_value, email, lead_source, sales_person, customer_status
    } = req.body;

    try {
        console.log('Inserting customer:', company_name);
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
             budget, required_products, pain_points,
             contract_value, email, lead_source, sales_person, customer_status]
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

app.post('/api/customers/:id/tasks', async (req, res) => {
    const customerId = req.params.id;
    const {
        title, description, task_type, priority, assigned_to, 
        due_date, reminder_date, created_by
    } = req.body;

    try {
        const result = await pool.query(
            `INSERT INTO x_crmsystem.tasks 
            (customer_id, title, description, task_type, priority, assigned_to, 
             due_date, reminder_date, created_by)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
            RETURNING *`,
            [customerId, title, description, task_type, priority, assigned_to,
             due_date, reminder_date, created_by]
        );
        res.json(result.rows[0]);
    } catch (err) {
        console.error('Add task error:', err);
        res.status(500).json({ error: 'Failed to add task: ' + err.message });
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

// แก้ไขการจัดการเวลาในการบันทึกการติดต่อ
app.post('/api/customers/:id/contacts', async (req, res) => {
    const customerId = req.params.id;
    const {
        contact_type, contact_status, contact_method, contact_person,
        contact_details, next_follow_up, notes, created_by, customer_status_update, contact_date
    } = req.body;

    try {
        // รับเวลาที่ส่งมาจาก frontend โดยตรง (ไม่แปลงเป็น UTC)
        // Frontend ส่งมาในรูปแบบ datetime-local (YYYY-MM-DDTHH:MM)
        let contactDateTime;
        if (contact_date) {
            // สร้าง Date object จากค่าที่ส่งมา แล้วแปลงเป็น ISO string สำหรับ database
            contactDateTime = new Date(contact_date).toISOString();
        } else {
            contactDateTime = new Date().toISOString();
        }

        console.log('Original contact_date from frontend:', contact_date);
        console.log('Processed contactDateTime for database:', contactDateTime);

        // Add contact log
        const contactResult = await pool.query(
            `INSERT INTO x_crmsystem.contact_logs 
            (customer_id, contact_type, contact_status, contact_method, contact_person,
             contact_details, next_follow_up, notes, created_by, contact_date)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
            RETURNING *`,
            [customerId, contact_type, contact_status, contact_method, contact_person,
             contact_details, next_follow_up, notes, created_by, contactDateTime]
        );

        console.log('Contact log saved with date:', contactResult.rows[0].contact_date);

        // Update customer status if provided
        if (customer_status_update) {
            await pool.query(
                `UPDATE x_crmsystem.customers 
                SET customer_status = $1, updated_at = CURRENT_TIMESTAMP
                WHERE id = $2`,
                [customer_status_update, customerId]
            );
        }

        res.json(contactResult.rows[0]);
    } catch (err) {
        console.error('Add contact log error:', err);
        res.status(500).json({ error: 'Failed to add contact log: ' + err.message });
    }
});

// Health check endpoint
app.get('/api/health', (req, res) => {
    res.json({ 
        status: 'OK', 
        timestamp: new Date().toISOString(),
        version: '1.1.0'
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
        console.log('CRM System v1.1.0 - Mobile Responsive');
    });
}