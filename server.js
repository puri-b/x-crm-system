const express = require('express');
const { Pool } = require('pg');
const cors = require('cors');
const bodyParser = require('body-parser');
require('dotenv').config();

const app = express();
const port = process.env.PORT || 3000;

app.use(cors());
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.static('public'));

const pool = new Pool({
    user: process.env.DB_USER,
    host: process.env.DB_HOST,
    database: process.env.DB_NAME,
    password: process.env.DB_PASSWORD,
    port: process.env.DB_PORT,
    ssl: false,
    connectionTimeoutMillis: 5000,
    idleTimeoutMillis: 10000,
    max: 10
});

pool.connect()
    .then(() => {
        console.log('Connected to PostgreSQL database');
    })
    .catch(err => {
        console.error('Database connection error:', err);
    });

app.get('/', (req, res) => {
    res.sendFile(__dirname + '/public/index.html');
});

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
        company_name, location, registration_info, business_type, industry,
        naics_sic_codes, contact_names, phone_number, contact_history,
        budget, evaluation_criteria, required_products, pain_points,
        selection_reason, contract_value, email, lead_source, sales_person
    } = req.body;

    try {
        console.log('Inserting customer:', company_name);
        const result = await pool.query(
            `INSERT INTO x_crmsystem.customers 
            (company_name, location, registration_info, business_type, industry,
             naics_sic_codes, contact_names, phone_number, contact_history,
             budget, evaluation_criteria, required_products, pain_points,
             selection_reason, contract_value, email, lead_source, sales_person)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18)
            RETURNING *`,
            [company_name, location, registration_info, business_type, industry,
             naics_sic_codes, contact_names, phone_number, contact_history,
             budget, evaluation_criteria, required_products, pain_points,
             selection_reason, contract_value, email, lead_source, sales_person]
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
        company_name, location, registration_info, business_type, industry,
        naics_sic_codes, contact_names, phone_number, contact_history,
        budget, evaluation_criteria, required_products, pain_points,
        selection_reason, contract_value, email, lead_source, sales_person
    } = req.body;

    try {
        console.log('Updating customer:', customerId);
        const result = await pool.query(
            `UPDATE x_crmsystem.customers 
            SET company_name = $1, location = $2, registration_info = $3, business_type = $4, 
                industry = $5, naics_sic_codes = $6, contact_names = $7, phone_number = $8, 
                contact_history = $9, budget = $10, evaluation_criteria = $11, 
                required_products = $12, pain_points = $13, selection_reason = $14, 
                contract_value = $15, email = $16, lead_source = $17, sales_person = $18,
                updated_at = CURRENT_TIMESTAMP
            WHERE id = $19
            RETURNING *`,
            [company_name, location, registration_info, business_type, industry,
             naics_sic_codes, contact_names, phone_number, contact_history,
             budget, evaluation_criteria, required_products, pain_points,
             selection_reason, contract_value, email, lead_source, sales_person, customerId]
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

app.post('/api/customers/:id/contacts', async (req, res) => {
    const customerId = req.params.id;
    const {
        contact_type, contact_status, contact_method, contact_person,
        contact_details, next_follow_up, notes, created_by
    } = req.body;

    try {
        const result = await pool.query(
            `INSERT INTO x_crmsystem.contact_logs 
            (customer_id, contact_type, contact_status, contact_method, contact_person,
             contact_details, next_follow_up, notes, created_by)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
            RETURNING *`,
            [customerId, contact_type, contact_status, contact_method, contact_person,
             contact_details, next_follow_up, notes, created_by]
        );
        res.json(result.rows[0]);
    } catch (err) {
        console.error('Add contact log error:', err);
        res.status(500).json({ error: 'Failed to add contact log: ' + err.message });
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

app.listen(port, () => {
    console.log(`Server running at http://localhost:${port}`);
});