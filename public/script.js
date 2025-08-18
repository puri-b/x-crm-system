document.addEventListener('DOMContentLoaded', function() {
    loadSettings();
    loadCustomers();
    initializeAutoRefresh();
    initializeKeyboardShortcuts();
    setupMobileFilters();
    
    document.getElementById('customerForm').addEventListener('submit', function(e) {
        e.preventDefault();
        addCustomer();
    });

    // Desktop filters
    const searchInput = document.getElementById('searchInput');
    const leadSourceFilter = document.getElementById('leadSourceFilter');
    const productFilter = document.getElementById('productFilter');
    const salesPersonFilter = document.getElementById('salesPersonFilter');
    const sortBy = document.getElementById('sortBy');

    if (searchInput) {
        searchInput.addEventListener('input', debounce(function() {
            currentPage = 1;
            filterAndSort();
        }, 300));
    }

    if (leadSourceFilter) {
        leadSourceFilter.addEventListener('change', function() {
            currentPage = 1;
            filterAndSort();
        });
    }

    if (productFilter) {
        productFilter.addEventListener('change', function() {
            currentPage = 1;
            filterAndSort();
        });
    }

    if (salesPersonFilter) {
        salesPersonFilter.addEventListener('change', function() {
            currentPage = 1;
            filterAndSort();
        });
    }

    if (sortBy) {
        sortBy.addEventListener('change', function() {
            currentSort = this.value;
            currentPage = 1;
            filterAndSort();
        });
    }
});

function setupMobileFilters() {
    // Sync mobile and desktop filters
    const mobileInputs = {
        'searchInputMobile': 'searchInput',
        'sortByMobile': 'sortBy',
        'leadSourceFilterMobile': 'leadSourceFilter',
        'productFilterMobile': 'productFilter',
        'salesPersonFilterMobile': 'salesPersonFilter'
    };

    Object.entries(mobileInputs).forEach(([mobileId, desktopId]) => {
        const mobileEl = document.getElementById(mobileId);
        const desktopEl = document.getElementById(desktopId);
        
        if (mobileEl && desktopEl) {
            mobileEl.addEventListener('input', function() {
                desktopEl.value = this.value;
                if (mobileId === 'searchInputMobile') {
                    currentPage = 1;
                    debounce(filterAndSort, 300)();
                } else {
                    currentPage = 1;
                    filterAndSort();
                }
            });

            mobileEl.addEventListener('change', function() {
                desktopEl.value = this.value;
                if (mobileId === 'sortByMobile') {
                    currentSort = this.value;
                }
                currentPage = 1;
                filterAndSort();
            });
        }
    });
}

let allCustomers = [];
let filteredCustomers = [];
let currentPage = 1;
let itemsPerPage = 10;
let currentSort = 'created_at_desc';
let autoRefreshInterval;
let lastUpdateTime = null;

function showAddForm() {
    document.getElementById('addCustomerForm').style.display = 'block';
    document.getElementById('customersList').style.display = 'none';
    document.getElementById('tasksView').style.display = 'none';
    document.getElementById('customerForm').reset();
    
    // Scroll to top on mobile
    if (window.innerWidth <= 768) {
        window.scrollTo(0, 0);
    }
}

function hideAddForm() {
    document.getElementById('addCustomerForm').style.display = 'none';
    document.getElementById('customersList').style.display = 'block';
    document.getElementById('tasksView').style.display = 'none';
    resetForm();
}

async function addCustomer() {
    const form = document.getElementById('customerForm');
    const formData = new FormData(form);
    
    // Validate form
    const errors = validateForm(formData);
    if (errors.length > 0) {
        showNotification('กรุณาแก้ไขข้อผิดพลาด:\n' + errors.join('\n'), 'danger', 5000);
        return;
    }
    
    // Removed fields: industry, naics_sic_codes, evaluation_criteria, selection_reason
    const customerData = {
        company_name: formData.get('company_name'),
        location: formData.get('location'),
        registration_info: formData.get('registration_info'),
        business_type: formData.get('business_type'),
        contact_names: formData.get('contact_names'),
        phone_number: formData.get('phone_number'),
        contact_history: formData.get('contact_history'),
        budget: formData.get('budget') ? parseFloat(formData.get('budget')) : null,
        required_products: formData.get('required_products'),
        pain_points: formData.get('pain_points'),
        contract_value: formData.get('contract_value') ? parseFloat(formData.get('contract_value')) : null,
        email: formData.get('email'),
        lead_source: formData.get('lead_source'),
        sales_person: formData.get('sales_person')
    };

    // Show loading
    const submitButton = form.querySelector('button[type="submit"]');
    const originalText = submitButton.innerHTML;
    submitButton.disabled = true;
    submitButton.innerHTML = '<span class="spinner-border spinner-border-sm me-2"></span>กำลังบันทึก...';

    try {
        const response = await fetch('/api/customers', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(customerData)
        });

        if (response.ok) {
            showNotification('บันทึกข้อมูลลูกค้าเรียบร้อยแล้ว', 'success');
            hideAddForm();
            loadCustomers();
        } else {
            const errorData = await response.json();
            showNotification('เกิดข้อผิดพลาด: ' + (errorData.error || 'ไม่สามารถบันทึกข้อมูลได้'), 'danger');
        }
    } catch (error) {
        console.error('Error:', error);
        showNotification('เกิดข้อผิดพลาดในการเชื่อมต่อ', 'danger');
    } finally {
        submitButton.disabled = false;
        submitButton.innerHTML = originalText;
    }
}

async function loadCustomers() {
    document.getElementById('addCustomerForm').style.display = 'none';
    document.getElementById('customersList').style.display = 'block';
    document.getElementById('tasksView').style.display = 'none';
    
    try {
        document.getElementById('customersTable').innerHTML = '<div class="loading">กำลังโหลดข้อมูล...</div>';
        
        const response = await fetch('/api/customers');
        allCustomers = await response.json();
        lastUpdateTime = new Date();

        if (allCustomers.length === 0) {
            document.getElementById('customersTable').innerHTML = 
                '<div class="empty-state"><i class="bi bi-people" style="font-size: 3rem; opacity: 0.3;"></i><br>ยังไม่มีข้อมูลลูกค้า<br><button class="btn btn-primary mt-2" onclick="showAddForm()">เพิ่มลูกค้าใหม่</button></div>';
            return;
        }

        currentPage = 1;
        filterAndSort();

    } catch (error) {
        console.error('Error:', error);
        document.getElementById('customersTable').innerHTML = 
            '<div class="empty-state"><i class="bi bi-exclamation-triangle" style="font-size: 3rem; opacity: 0.3;"></i><br>เกิดข้อผิดพลาดในการโหลดข้อมูล<br><button class="btn btn-outline-primary mt-2" onclick="loadCustomers()">ลองใหม่</button></div>';
        showNotification('เกิดข้อผิดพลาดในการโหลดข้อมูล', 'danger');
    }
}

function filterAndSort() {
    if (!allCustomers || allCustomers.length === 0) return;

    const searchInput = document.getElementById('searchInput');
    const leadSourceFilter = document.getElementById('leadSourceFilter');
    const productFilter = document.getElementById('productFilter');
    const salesPersonFilter = document.getElementById('salesPersonFilter');

    const searchTerm = searchInput ? searchInput.value.toLowerCase() : '';
    const leadSourceValue = leadSourceFilter ? leadSourceFilter.value : '';
    const productValue = productFilter ? productFilter.value : '';
    const salesPersonValue = salesPersonFilter ? salesPersonFilter.value : '';

    // กรองข้อมูล
    filteredCustomers = allCustomers.filter(customer => {
        // Basic search
        const matchesSearch = !searchTerm || 
            customer.company_name.toLowerCase().includes(searchTerm) ||
            (customer.email && customer.email.toLowerCase().includes(searchTerm)) ||
            (customer.phone_number && customer.phone_number.includes(searchTerm)) ||
            (customer.contact_names && customer.contact_names.toLowerCase().includes(searchTerm));

        const matchesLeadSource = !leadSourceValue || customer.lead_source === leadSourceValue;
        
        const matchesProduct = !productValue || 
            (customer.required_products && customer.required_products.includes(productValue));

        const matchesSalesPerson = !salesPersonValue || customer.sales_person === salesPersonValue;

        // Advanced search
        let matchesAdvanced = true;
        
        if (Object.keys(advancedSearchCriteria).length > 0) {
            for (const [field, value] of Object.entries(advancedSearchCriteria)) {
                if (field.endsWith('_from')) {
                    const fieldName = field.replace('_from', '');
                    const customerValue = parseFloat(customer[fieldName]) || 0;
                    const searchValue = parseFloat(value) || 0;
                    if (customerValue < searchValue) {
                        matchesAdvanced = false;
                        break;
                    }
                } else if (field.endsWith('_to')) {
                    const fieldName = field.replace('_to', '');
                    const customerValue = parseFloat(customer[fieldName]) || 0;
                    const searchValue = parseFloat(value) || 999999999;
                    if (customerValue > searchValue) {
                        matchesAdvanced = false;
                        break;
                    }
                } else if (field === 'created_from') {
                    const customerDate = new Date(customer.created_at);
                    const searchDate = new Date(value);
                    if (customerDate < searchDate) {
                        matchesAdvanced = false;
                        break;
                    }
                } else if (field === 'created_to') {
                    const customerDate = new Date(customer.created_at);
                    const searchDate = new Date(value);
                    searchDate.setHours(23, 59, 59, 999);
                    if (customerDate > searchDate) {
                        matchesAdvanced = false;
                        break;
                    }
                } else {
                    const customerValue = (customer[field] || '').toLowerCase();
                    const searchValue = value.toLowerCase();
                    if (!customerValue.includes(searchValue)) {
                        matchesAdvanced = false;
                        break;
                    }
                }
            }
        }

        return matchesSearch && matchesLeadSource && matchesProduct && matchesSalesPerson && matchesAdvanced;
    });

    // เรียงลำดับข้อมูล
    sortCustomers();
    
    // แสดงข้อมูลตาม pagination
    displayPaginatedCustomers();
}

function sortCustomers() {
    const [field, direction] = currentSort.split('_');
    
    filteredCustomers.sort((a, b) => {
        let valueA = a[field];
        let valueB = b[field];

        // จัดการค่า null/undefined
        if (valueA == null) valueA = '';
        if (valueB == null) valueB = '';

        // จัดการการเรียงลำดับตามประเภทข้อมูล
        if (field === 'created_at') {
            valueA = new Date(valueA);
            valueB = new Date(valueB);
        } else if (field === 'contract_value') {
            valueA = parseFloat(valueA) || 0;
            valueB = parseFloat(valueB) || 0;
        } else if (typeof valueA === 'string') {
            valueA = valueA.toLowerCase();
            valueB = valueB.toLowerCase();
        }

        let comparison = 0;
        if (valueA > valueB) {
            comparison = 1;
        } else if (valueA < valueB) {
            comparison = -1;
        }

        return direction === 'desc' ? comparison * -1 : comparison;
    });
}

function displayPaginatedCustomers() {
    const startIndex = (currentPage - 1) * itemsPerPage;
    const endIndex = startIndex + itemsPerPage;
    const paginatedData = filteredCustomers.slice(startIndex, endIndex);

    displayCustomers(paginatedData);
    updatePagination();
    updateRecordInfo();
}

function displayCustomers(customers) {
    if (customers.length === 0) {
        document.getElementById('customersTable').innerHTML = 
            '<div class="empty-state">ไม่พบข้อมูลลูกค้าที่ตรงกับการค้นหา</div>';
        return;
    }

    // Check if mobile view
    if (window.innerWidth <= 768) {
        displayMobileCustomers(customers);
        return;
    }

    let tableHTML = `
        <div class="table-responsive">
            <table class="table table-hover">
                <thead>
                    <tr>
                        <th>ชื่อบริษัท</th>
                        <th>ผู้ติดต่อ</th>
                        <th>โทรศัพท์</th>
                        <th>อีเมล</th>
                        <th>ผลิตภัณฑ์ที่สนใจ</th>
                        <th>แหล่งที่มา</th>
                        <th>Sales Person</th>
                        <th>Contract Value</th>
                        <th>วันที่สร้าง</th>
                    </tr>
                </thead>
                <tbody>
    `;

    customers.forEach(customer => {
        const createdDate = new Date(customer.created_at).toLocaleDateString('th-TH');
        const contractValue = customer.contract_value ? 
            formatCurrency(customer.contract_value) : '-';
        const leadSourceBadge = customer.lead_source === 'Online' ? 
            '<span class="badge badge-online">Online</span>' : 
            '<span class="badge badge-offline">Offline</span>';

        const salesPersonBadge = getSalesPersonBadge(customer.sales_person);

        tableHTML += `
            <tr class="customer-row" onclick="viewCustomer(${customer.id})">
                <td><strong>${customer.company_name || '-'}</strong></td>
                <td class="text-truncate-custom">${customer.contact_names || '-'}</td>
                <td>${customer.phone_number || '-'}</td>
                <td class="text-truncate-custom">${customer.email || '-'}</td>
                <td class="text-truncate-custom">${customer.required_products || '-'}</td>
                <td>${leadSourceBadge}</td>
                <td>${salesPersonBadge}</td>
                <td>${contractValue}</td>
                <td>${createdDate}</td>
            </tr>
        `;
    });

    tableHTML += '</tbody></table></div>';
    document.getElementById('customersTable').innerHTML = tableHTML;
}

function displayMobileCustomers(customers) {
    let mobileHTML = '';
    
    customers.forEach(customer => {
        const createdDate = new Date(customer.created_at).toLocaleDateString('th-TH');
        const contractValue = customer.contract_value ? 
            formatCurrency(customer.contract_value) : 'ไม่ระบุ';
        const leadSourceBadge = customer.lead_source === 'Online' ? 
            '<span class="badge badge-online">Online</span>' : 
            '<span class="badge badge-offline">Offline</span>';
        const salesPersonBadge = getSalesPersonBadge(customer.sales_person);

        mobileHTML += `
            <div class="mobile-table-card" onclick="viewCustomer(${customer.id})">
                <div class="company-name">${customer.company_name || 'ไม่ระบุชื่อบริษัท'}</div>
                <div class="contact-info">
                    ${customer.contact_names ? `<i class="bi bi-person me-1"></i>${customer.contact_names}` : ''}
                    ${customer.phone_number ? `<br><i class="bi bi-telephone me-1"></i>${customer.phone_number}` : ''}
                    ${customer.email ? `<br><i class="bi bi-envelope me-1"></i>${customer.email}` : ''}
                </div>
                <div class="badges">
                    ${leadSourceBadge}
                    ${salesPersonBadge}
                    <span class="badge bg-secondary">${contractValue}</span>
                </div>
                <div class="mt-2">
                    <small class="text-muted">
                        <i class="bi bi-calendar me-1"></i>${createdDate}
                        ${customer.required_products ? ` • ${customer.required_products}` : ''}
                    </small>
                </div>
            </div>
        `;
    });
    
    document.getElementById('customersTable').innerHTML = mobileHTML;
}

function updatePagination() {
    const totalPages = Math.ceil(filteredCustomers.length / itemsPerPage);
    const paginationNav = document.getElementById('paginationNav');
    
    if (totalPages <= 1) {
        paginationNav.innerHTML = '';
        return;
    }

    let paginationHTML = '';

    // ปุ่ม Previous
    if (currentPage > 1) {
        paginationHTML += `<li class="page-item"><a class="page-link" href="#" onclick="changePage(${currentPage - 1})">ก่อนหน้า</a></li>`;
    }

    // หมายเลขหน้า
    const startPage = Math.max(1, currentPage - 2);
    const endPage = Math.min(totalPages, currentPage + 2);

    if (startPage > 1) {
        paginationHTML += `<li class="page-item"><a class="page-link" href="#" onclick="changePage(1)">1</a></li>`;
        if (startPage > 2) {
            paginationHTML += `<li class="page-item disabled"><span class="page-link">...</span></li>`;
        }
    }

    for (let i = startPage; i <= endPage; i++) {
        const activeClass = i === currentPage ? 'active' : '';
        paginationHTML += `<li class="page-item ${activeClass}"><a class="page-link" href="#" onclick="changePage(${i})">${i}</a></li>`;
    }

    if (endPage < totalPages) {
        if (endPage < totalPages - 1) {
            paginationHTML += `<li class="page-item disabled"><span class="page-link">...</span></li>`;
        }
        paginationHTML += `<li class="page-item"><a class="page-link" href="#" onclick="changePage(${totalPages})">${totalPages}</a></li>`;
    }

    // ปุ่ม Next
    if (currentPage < totalPages) {
        paginationHTML += `<li class="page-item"><a class="page-link" href="#" onclick="changePage(${currentPage + 1})">ถัดไป</a></li>`;
    }

    paginationNav.innerHTML = paginationHTML;
}

function updateRecordInfo() {
    const startRecord = filteredCustomers.length === 0 ? 0 : (currentPage - 1) * itemsPerPage + 1;
    const endRecord = Math.min(currentPage * itemsPerPage, filteredCustomers.length);
    
    document.getElementById('recordInfo').textContent = 
        `แสดง ${startRecord}-${endRecord} จาก ${filteredCustomers.length} รายการ (ทั้งหมด ${allCustomers.length} รายการ)`;
}

function changePage(page) {
    currentPage = page;
    displayPaginatedCustomers();
}

async function viewCustomer(customerId) {
    try {
        const response = await fetch(`/api/customers/${customerId}`);
        const customer = await response.json();

        if (response.ok) {
            showCustomerDetail(customer);
        } else {
            alert('ไม่สามารถโหลดข้อมูลลูกค้าได้');
        }
    } catch (error) {
        console.error('Error:', error);
        alert('เกิดข้อผิดพลาดในการโหลดข้อมูล');
    }
}

function showCustomerDetail(customer) {
    const modalHTML = `
        <div class="modal fade" id="customerModal" tabindex="-1">
            <div class="modal-dialog modal-lg">
                <div class="modal-content">
                    <div class="modal-header">
                        <h5 class="modal-title">รายละเอียดลูกค้า - ${customer.company_name}</h5>
                        <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
                    </div>
                    <div class="modal-body">
                        <div class="row">
                            <div class="col-md-6 mb-3">
                                <strong>ชื่อบริษัท:</strong><br>
                                ${customer.company_name || '-'}
                            </div>
                            <div class="col-md-6 mb-3">
                                <strong>อีเมล:</strong><br>
                                ${customer.email || '-'}
                            </div>
                            <div class="col-md-6 mb-3">
                                <strong>เบอร์โทรศัพท์:</strong><br>
                                ${customer.phone_number || '-'}
                            </div>
                            <div class="col-md-6 mb-3">
                                <strong>แหล่งที่มา Lead:</strong><br>
                                <span class="badge ${customer.lead_source === 'Online' ? 'badge-online' : 'badge-offline'}">${customer.lead_source || '-'}</span>
                            </div>
                            <div class="col-md-6 mb-3">
                                <strong>Sales Person:</strong><br>
                                ${getSalesPersonBadge(customer.sales_person)}
                            </div>
                            <div class="col-md-12 mb-3">
                                <strong>ที่ตั้ง:</strong><br>
                                ${customer.location || '-'}
                            </div>
                            <div class="col-md-12 mb-3">
                                <strong>ข้อมูลการจดทะเบียน:</strong><br>
                                ${customer.registration_info || '-'}
                            </div>
                            <div class="col-md-6 mb-3">
                                <strong>ประเภทธุรกิจ:</strong><br>
                                ${customer.business_type || '-'}
                            </div>
                            <div class="col-md-6 mb-3">
                                <strong>ชื่อผู้ติดต่อ:</strong><br>
                                ${customer.contact_names || '-'}
                            </div>
                            <div class="col-md-6 mb-3">
                                <strong>งบประมาณ:</strong><br>
                                ${customer.budget ? formatCurrency(customer.budget) : '-'}
                            </div>
                            <div class="col-md-6 mb-3">
                                <strong>Contract Value:</strong><br>
                                ${customer.contract_value ? formatCurrency(customer.contract_value) : '-'}
                            </div>
                            <div class="col-md-12 mb-3">
                                <strong>ผลิตภัณฑ์/บริการที่สนใจ:</strong><br>
                                ${customer.required_products || '-'}
                            </div>
                            <div class="col-md-12 mb-3">
                                <strong>ประวัติการติดต่อ:</strong><br>
                                ${customer.contact_history || '-'}
                            </div>
                            <div class="col-md-12 mb-3">
                                <strong>Pain Points และปัญหาที่ต้องการแก้ไข:</strong><br>
                                ${customer.pain_points || '-'}
                            </div>
                            <div class="col-md-6 mb-3">
                                <strong>วันที่สร้าง:</strong><br>
                                ${new Date(customer.created_at).toLocaleString('th-TH')}
                            </div>
                            <div class="col-md-6 mb-3">
                                <strong>แก้ไขล่าสุด:</strong><br>
                                ${new Date(customer.updated_at).toLocaleString('th-TH')}
                            </div>
                        </div>
                    </div>
                    <div class="modal-footer flex-wrap">
                        <button type="button" class="btn btn-info me-auto" onclick="showContactModal(${customer.id})">อัพเดตการติดต่อ</button>
                        <button type="button" class="btn btn-warning" onclick="showTaskModal(${customer.id}, '${customer.company_name}')">จัดการงาน</button>
                        <button type="button" class="btn btn-danger" onclick="deleteCustomer(${customer.id}, '${customer.company_name}')">ลบ</button>
                        <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">ปิด</button>
                        <button type="button" class="btn btn-primary" onclick="editCustomer(${customer.id})">แก้ไข</button>
                    </div>
                </div>
            </div>
        </div>
    `;

    document.body.insertAdjacentHTML('beforeend', modalHTML);
    const modal = new bootstrap.Modal(document.getElementById('customerModal'));
    modal.show();

    document.getElementById('customerModal').addEventListener('hidden.bs.modal', function () {
        this.remove();
    });
}

function editCustomer(customerId) {
    fetch(`/api/customers/${customerId}`)
        .then(response => response.json())
        .then(customer => {
            fillEditForm(customer);
            document.getElementById('customerModal').querySelector('[data-bs-dismiss="modal"]').click();
        })
        .catch(error => {
            console.error('Error:', error);
            alert('ไม่สามารถโหลดข้อมูลลูกค้าได้');
        });
}

function fillEditForm(customer) {
    showAddForm();
    
    // Fill form with customer data (excluding removed fields)
    document.querySelector('input[name="company_name"]').value = customer.company_name || '';
    document.querySelector('input[name="email"]').value = customer.email || '';
    document.querySelector('textarea[name="location"]').value = customer.location || '';
    document.querySelector('textarea[name="registration_info"]').value = customer.registration_info || '';
    document.querySelector('input[name="business_type"]').value = customer.business_type || '';
    document.querySelector('textarea[name="contact_names"]').value = customer.contact_names || '';
    document.querySelector('input[name="phone_number"]').value = customer.phone_number || '';
    document.querySelector('input[name="budget"]').value = customer.budget || '';
    document.querySelector('textarea[name="contact_history"]').value = customer.contact_history || '';
    document.querySelector('select[name="required_products"]').value = customer.required_products || '';
    document.querySelector('select[name="lead_source"]').value = customer.lead_source || '';
    document.querySelector('select[name="sales_person"]').value = customer.sales_person || '';
    document.querySelector('textarea[name="pain_points"]').value = customer.pain_points || '';
    document.querySelector('input[name="contract_value"]').value = customer.contract_value || '';
    
    document.querySelector('.card-title').innerHTML = '<i class="bi bi-pencil me-2"></i>แก้ไขข้อมูลลูกค้า';
    document.querySelector('button[type="submit"]').innerHTML = '<i class="bi bi-check-lg me-1"></i>อัปเดตข้อมูล';
    document.querySelector('button[type="submit"]').onclick = function(e) {
        e.preventDefault();
        updateCustomer(customer.id);
    };
}

async function updateCustomer(customerId) {
    const form = document.getElementById('customerForm');
    const formData = new FormData(form);
    
    // Updated customer data structure (without removed fields)
    const customerData = {
        company_name: formData.get('company_name'),
        location: formData.get('location'),
        registration_info: formData.get('registration_info'),
        business_type: formData.get('business_type'),
        contact_names: formData.get('contact_names'),
        phone_number: formData.get('phone_number'),
        contact_history: formData.get('contact_history'),
        budget: formData.get('budget') ? parseFloat(formData.get('budget')) : null,
        required_products: formData.get('required_products'),
        pain_points: formData.get('pain_points'),
        contract_value: formData.get('contract_value') ? parseFloat(formData.get('contract_value')) : null,
        email: formData.get('email'),
        lead_source: formData.get('lead_source'),
        sales_person: formData.get('sales_person')
    };

    try {
        const response = await fetch(`/api/customers/${customerId}`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(customerData)
        });

        if (response.ok) {
            showNotification('อัปเดตข้อมูลลูกค้าเรียบร้อยแล้ว', 'success');
            resetForm();
            hideAddForm();
            loadCustomers();
        } else {
            showNotification('เกิดข้อผิดพลาดในการอัปเดตข้อมูล', 'danger');
        }
    } catch (error) {
        console.error('Error:', error);
        showNotification('เกิดข้อผิดพลาดในการเชื่อมต่อ', 'danger');
    }
}

async function deleteCustomer(customerId, companyName) {
    if (!confirm(`คุณต้องการลบข้อมูลลูกค้า "${companyName}" หรือไม่?`)) {
        return;
    }

    try {
        const response = await fetch(`/api/customers/${customerId}`, {
            method: 'DELETE'
        });

        if (response.ok) {
            showNotification('ลบข้อมูลลูกค้าเรียบร้อยแล้ว', 'success');
            loadCustomers();
            const modal = document.getElementById('customerModal');
            if (modal) {
                bootstrap.Modal.getInstance(modal).hide();
            }
        } else {
            showNotification('เกิดข้อผิดพลาดในการลบข้อมูล', 'danger');
        }
    } catch (error) {
        console.error('Error:', error);
        showNotification('เกิดข้อผิดพลาดในการเชื่อมต่อ', 'danger');
    }
}

function resetForm() {
    document.getElementById('customerForm').reset();
    document.querySelector('.card-title').innerHTML = '<i class="bi bi-person-plus me-2"></i>เพิ่มข้อมูลลูกค้าใหม่';
    document.querySelector('button[type="submit"]').innerHTML = '<i class="bi bi-check-lg me-1"></i>บันทึกข้อมูล';
    document.querySelector('button[type="submit"]').onclick = null;
}

function exportToCSV() {
    const dataToExport = filteredCustomers.length > 0 ? filteredCustomers : allCustomers;
    
    if (dataToExport.length === 0) {
        showNotification('ไม่มีข้อมูลลูกค้าที่จะส่งออก', 'warning');
        return;
    }

    const csvContent = convertToCSV(dataToExport);
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    
    if (link.download !== undefined) {
        const url = URL.createObjectURL(blob);
        link.setAttribute('href', url);
        
        const isFiltered = filteredCustomers.length > 0 && filteredCustomers.length < allCustomers.length;
        const filterStatus = isFiltered ? '_filtered' : '';
        link.setAttribute('download', `customers${filterStatus}_${new Date().toISOString().split('T')[0]}.csv`);
        
        link.style.visibility = 'hidden';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        
        showNotification('ส่งออกข้อมูลเรียบร้อยแล้ว', 'success');
    }
}

function initializeAutoRefresh() {
    // Auto-refresh ทุก 5 นาที
    autoRefreshInterval = setInterval(() => {
        if (document.visibilityState === 'visible') {
            refreshData();
        }
    }, 300000); // 5 minutes
}

function refreshData() {
    const currentView = getCurrentView();
    
    if (currentView === 'customers') {
        loadCustomers();
    } else if (currentView === 'tasks') {
        loadTasksDashboard();
        loadAllTasks();
    }
    
    showNotification('ข้อมูลได้รับการอัพเดตแล้ว', 'success');
}

function getCurrentView() {
    if (document.getElementById('customersList').style.display !== 'none') {
        return 'customers';
    } else if (document.getElementById('tasksView').style.display !== 'none') {
        return 'tasks';
    } else if (document.getElementById('addCustomerForm').style.display !== 'none') {
        return 'form';
    }
    return 'customers';
}

function initializeKeyboardShortcuts() {
    document.addEventListener('keydown', function(e) {
        // Ctrl + N = เพิ่มลูกค้าใหม่
        if (e.ctrlKey && e.key === 'n') {
            e.preventDefault();
            showAddForm();
        }
        
        // Ctrl + F = ค้นหา
        if (e.ctrlKey && e.key === 'f') {
            e.preventDefault();
            const searchInput = document.getElementById('searchInput') || document.getElementById('searchInputMobile');
            if (searchInput) {
                searchInput.focus();
            }
        }
        
        // Ctrl + T = งานที่ต้องทำ
        if (e.ctrlKey && e.key === 't') {
            e.preventDefault();
            showTasksView();
        }
        
        // Escape = ปิด Modal
        if (e.key === 'Escape') {
            const activeModal = document.querySelector('.modal.show');
            if (activeModal) {
                const modal = bootstrap.Modal.getInstance(activeModal);
                if (modal) modal.hide();
            }
        }
    });
}

function showNotification(message, type = 'info', duration = 3000) {
    const notification = document.createElement('div');
    notification.className = `alert alert-${type} alert-dismissible fade show position-fixed`;
    notification.style.cssText = 'top: 20px; right: 20px; z-index: 9999; min-width: 300px; max-width: 400px;';
    
    notification.innerHTML = `
        ${message}
        <button type="button" class="btn-close" data-bs-dismiss="alert"></button>
    `;
    
    document.body.appendChild(notification);
    
    setTimeout(() => {
        if (notification.parentNode) {
            notification.remove();
        }
    }, duration);
}

function showSettings() {
    const settingsHTML = `
        <div class="modal fade" id="settingsModal" tabindex="-1">
            <div class="modal-dialog">
                <div class="modal-content">
                    <div class="modal-header">
                        <h5 class="modal-title">การตั้งค่าระบบ</h5>
                        <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
                    </div>
                    <div class="modal-body">
                        <div class="mb-3">
                            <label class="form-label">จำนวนรายการต่อหน้า</label>
                            <select class="form-select" id="itemsPerPageSetting">
                                <option value="5" ${itemsPerPage === 5 ? 'selected' : ''}>5</option>
                                <option value="10" ${itemsPerPage === 10 ? 'selected' : ''}>10</option>
                                <option value="25" ${itemsPerPage === 25 ? 'selected' : ''}>25</option>
                                <option value="50" ${itemsPerPage === 50 ? 'selected' : ''}>50</option>
                                <option value="100" ${itemsPerPage === 100 ? 'selected' : ''}>100</option>
                            </select>
                        </div>
                        
                        <div class="mb-3">
                            <div class="form-check">
                                <input class="form-check-input" type="checkbox" id="autoRefreshSetting" ${autoRefreshInterval ? 'checked' : ''}>
                                <label class="form-check-label" for="autoRefreshSetting">
                                    เปิดการอัพเดตอัตโนมัติ (ทุก 5 นาที)
                                </label>
                            </div>
                        </div>
                        
                        <div class="mb-3">
                            <label class="form-label">ข้อมูลระบบ</label>
                            <div class="card">
                                <div class="card-body">
                                    <p class="card-text mb-1"><strong>จำนวนลูกค้าทั้งหมด:</strong> ${allCustomers.length} ราย</p>
                                    <p class="card-text mb-1"><strong>จำนวนที่แสดง:</strong> ${filteredCustomers.length} ราย</p>
                                    <p class="card-text mb-1"><strong>อัพเดตล่าสุด:</strong> ${lastUpdateTime ? new Date(lastUpdateTime).toLocaleString('th-TH') : 'ไม่ทราบ'}</p>
                                    <p class="card-text mb-0"><strong>เวอร์ชั่น:</strong> 1.1.0</p>
                                </div>
                            </div>
                        </div>

                        <div class="mb-3">
                            <label class="form-label">คีย์ลัด</label>
                            <div class="card">
                                <div class="card-body small">
                                    <p class="mb-1"><kbd>Ctrl + N</kbd> เพิ่มลูกค้าใหม่</p>
                                    <p class="mb-1"><kbd>Ctrl + F</kbd> ค้นหา</p>
                                    <p class="mb-1"><kbd>Ctrl + T</kbd> งานที่ต้องทำ</p>
                                    <p class="mb-0"><kbd>Esc</kbd> ปิด Modal</p>
                                </div>
                            </div>
                        </div>
                    </div>
                    <div class="modal-footer">
                        <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">ปิด</button>
                        <button type="button" class="btn btn-primary" onclick="saveSettings()">บันทึก</button>
                    </div>
                </div>
            </div>
        </div>
    `;

    document.body.insertAdjacentHTML('beforeend', settingsHTML);
    const modal = new bootstrap.Modal(document.getElementById('settingsModal'));
    modal.show();

    document.getElementById('settingsModal').addEventListener('hidden.bs.modal', function () {
        this.remove();
    });
}

function saveSettings() {
    const newItemsPerPage = parseInt(document.getElementById('itemsPerPageSetting').value);
    const autoRefreshEnabled = document.getElementById('autoRefreshSetting').checked;
    
    if (newItemsPerPage !== itemsPerPage) {
        itemsPerPage = newItemsPerPage;
        currentPage = 1;
        displayPaginatedCustomers();
    }
    
    if (autoRefreshEnabled && !autoRefreshInterval) {
        initializeAutoRefresh();
    } else if (!autoRefreshEnabled && autoRefreshInterval) {
        clearInterval(autoRefreshInterval);
        autoRefreshInterval = null;
    }
    
    // บันทึกการตั้งค่าใน localStorage
    localStorage.setItem('crmSettings', JSON.stringify({
        itemsPerPage: itemsPerPage,
        autoRefresh: autoRefreshEnabled
    }));
    
    showNotification('บันทึกการตั้งค่าเรียบร้อยแล้ว', 'success');
    document.getElementById('settingsModal').querySelector('[data-bs-dismiss="modal"]').click();
}

function loadSettings() {
    try {
        const settings = JSON.parse(localStorage.getItem('crmSettings'));
        if (settings) {
            itemsPerPage = settings.itemsPerPage || 10;
            if (!settings.autoRefresh) {
                clearInterval(autoRefreshInterval);
                autoRefreshInterval = null;
            }
        }
    } catch (error) {
        console.log('No saved settings found');
    }
}

function debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
        const later = () => {
            clearTimeout(timeout);
            func(...args);
        };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
    };
}

function validateForm(formData) {
    const errors = [];
    
    if (!formData.get('company_name')?.trim()) {
        errors.push('ชื่อบริษัทเป็นข้อมูลที่จำเป็น');
    }
    
    if (!formData.get('sales_person')?.trim()) {
        errors.push('Sales Person เป็นข้อมูลที่จำเป็น');
    }
    
    const email = formData.get('email');
    if (email && !isValidEmail(email)) {
        errors.push('รูปแบบอีเมลไม่ถูกต้อง');
    }
    
    const phone = formData.get('phone_number');
    if (phone && !isValidPhone(phone)) {
        errors.push('รูปแบบเบอร์โทรศัพท์ไม่ถูกต้อง');
    }
    
    return errors;
}

function isValidEmail(email) {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
}

function isValidPhone(phone) {
    const phoneRegex = /^[\d\-\+\(\)\s]+$/;
    return phoneRegex.test(phone) && phone.replace(/\D/g, '').length >= 9;
}

// Updated convertToCSV function to exclude removed fields
function convertToCSV(data) {
    const headers = [
        'ID', 'ชื่อบริษัท', 'ที่ตั้ง', 'ข้อมูลการจดทะเบียน', 'ประเภทธุรกิจ', 
        'ชื่อผู้ติดต่อ', 'เบอร์โทรศัพท์', 'ประวัติการติดต่อ', 'งบประมาณ', 
        'ผลิตภัณฑ์ที่สนใจ', 'Pain Points', 'Contract Value', 'อีเมล', 
        'แหล่งที่มา Lead', 'Sales Person', 'วันที่สร้าง', 'แก้ไขล่าสุด'
    ];

    const csvRows = [headers.join(',')];

    data.forEach(customer => {
        const row = [
            customer.id,
            `"${customer.company_name || ''}"`,
            `"${customer.location || ''}"`,
            `"${customer.registration_info || ''}"`,
            `"${customer.business_type || ''}"`,
            `"${customer.contact_names || ''}"`,
            `"${customer.phone_number || ''}"`,
            `"${customer.contact_history || ''}"`,
            customer.budget || '',
            `"${customer.required_products || ''}"`,
            `"${customer.pain_points || ''}"`,
            customer.contract_value || '',
            `"${customer.email || ''}"`,
            `"${customer.lead_source || ''}"`,
            `"${customer.sales_person || ''}"`,
            `"${new Date(customer.created_at).toLocaleString('th-TH')}"`,
            `"${new Date(customer.updated_at).toLocaleString('th-TH')}"`
        ];
        csvRows.push(row.join(','));
    });

    return csvRows.join('\n');
}

function clearFilters() {
    document.getElementById('searchInput').value = '';
    document.getElementById('leadSourceFilter').value = '';
    document.getElementById('productFilter').value = '';
    document.getElementById('salesPersonFilter').value = '';
    document.getElementById('sortBy').value = 'created_at_desc';
    
    // Clear mobile filters too
    document.getElementById('searchInputMobile').value = '';
    document.getElementById('sortByMobile').value = 'created_at_desc';
    document.getElementById('leadSourceFilterMobile').value = '';
    document.getElementById('productFilterMobile').value = '';
    document.getElementById('salesPersonFilterMobile').value = '';
    
    advancedSearchCriteria = {};
    currentSort = 'created_at_desc';
    currentPage = 1;
    filterAndSort();
    updateSearchStatus();
}

function getSalesPersonBadge(salesPerson) {
    if (!salesPerson) return '<span class="badge bg-secondary">ไม่ระบุ</span>';
    
    const colors = {
        'Aui': 'bg-primary',
        'Ink': 'bg-success', 
        'Puri': 'bg-info'
    };
    
    return `<span class="badge ${colors[salesPerson] || 'bg-secondary'}">${salesPerson}</span>`;
}

async function showTasksView() {
    document.getElementById('addCustomerForm').style.display = 'none';
    document.getElementById('customersList').style.display = 'none';
    document.getElementById('tasksView').style.display = 'block';

    loadTasksDashboard();
    loadAllTasks();

    // Add event listeners for task filters
    document.getElementById('taskStatusFilter').addEventListener('change', loadAllTasks);
    document.getElementById('taskAssigneeFilter').addEventListener('change', loadAllTasks);
}

// Task management functions
async function loadTasksDashboard() {
    try {
        const response = await fetch('/api/tasks/dashboard');
        const data = await response.json();

        document.getElementById('todayTasks').innerHTML = generateTaskCards(data.today, 'วันนี้ไม่มีงานที่ต้องทำ');
        document.getElementById('overdueTasks').innerHTML = generateTaskCards(data.overdue, 'ไม่มีงานเกินกำหนด');
        document.getElementById('urgentTasks').innerHTML = generateTaskCards(data.urgent, 'ไม่มีงานสำคัญ');

    } catch (error) {
        console.error('Error loading tasks dashboard:', error);
    }
}

async function loadAllTasks() {
    try {
        const response = await fetch('/api/tasks');
        const tasks = await response.json();

        const statusFilter = document.getElementById('taskStatusFilter').value;
        const assigneeFilter = document.getElementById('taskAssigneeFilter').value;

        let filteredTasks = tasks.filter(task => {
            return (!statusFilter || task.status === statusFilter) &&
                   (!assigneeFilter || task.assigned_to === assigneeFilter);
        });

        document.getElementById('allTasksTable').innerHTML = generateTasksTable(filteredTasks);

    } catch (error) {
        console.error('Error loading all tasks:', error);
    }
}

function generateTaskCards(tasks, emptyMessage) {
    if (tasks.length === 0) {
        return `<div class="text-center text-muted">${emptyMessage}</div>`;
    }

    return tasks.map(task => `
        <div class="card mb-2">
            <div class="card-body p-2">
                <div class="d-flex justify-content-between align-items-start">
                    <h6 class="card-title mb-1">${task.title}</h6>
                    <span class="badge ${getPriorityBadgeClass(task.priority)}">${task.priority}</span>
                </div>
                <p class="card-text mb-1"><small>${task.company_name}</small></p>
                <p class="card-text mb-1"><small>กำหนด: ${new Date(task.due_date).toLocaleDateString('th-TH')}</small></p>
                <div class="d-flex gap-1">
                    <button class="btn btn-sm btn-outline-success" onclick="updateTaskStatus(${task.id}, 'Completed')">
                        <i class="bi bi-check"></i>
                    </button>
                    <button class="btn btn-sm btn-outline-primary" onclick="updateTaskStatus(${task.id}, 'In Progress')">
                        <i class="bi bi-play"></i>
                    </button>
                </div>
            </div>
        </div>
    `).join('');
}

function generateTasksTable(tasks) {
    if (tasks.length === 0) {
        return '<div class="text-center text-muted py-3">ไม่มีงานตามเงื่อนไขที่ระบุ</div>';
    }

    let tableHTML = `
        <div class="table-responsive">
            <table class="table table-hover">
                <thead>
                    <tr>
                        <th>งาน</th>
                        <th>ลูกค้า</th>
                        <th>ประเภท</th>
                        <th>ความสำคัญ</th>
                        <th>ผู้รับผิดชอบ</th>
                        <th>กำหนดเสร็จ</th>
                        <th>สถานะ</th>
                        <th>การจัดการ</th>
                    </tr>
                </thead>
                <tbody>
    `;

    tasks.forEach(task => {
        const dueDate = task.due_date ? new Date(task.due_date).toLocaleDateString('th-TH') : '-';
        const isOverdue = task.due_date && new Date(task.due_date) < new Date() && task.status !== 'Completed';
        
        tableHTML += `
            <tr class="${isOverdue ? 'table-danger' : ''}">
                <td>
                    <strong>${task.title}</strong>
                    ${task.description ? `<br><small class="text-muted">${task.description}</small>` : ''}
                </td>
                <td>${task.company_name || '-'}</td>
                <td>${task.task_type}</td>
                <td><span class="badge ${getPriorityBadgeClass(task.priority)}">${task.priority}</span></td>
                <td>${getSalesPersonBadge(task.assigned_to)}</td>
                <td>${dueDate}</td>
                <td><span class="badge ${getStatusBadgeClass(task.status)}">${getStatusText(task.status)}</span></td>
                <td>
                    ${task.status !== 'Completed' ? `
                        <button class="btn btn-sm btn-outline-success me-1" onclick="updateTaskStatus(${task.id}, 'Completed')" title="ทำเสร็จ">
                            <i class="bi bi-check"></i>
                        </button>
                        <button class="btn btn-sm btn-outline-primary" onclick="updateTaskStatus(${task.id}, 'In Progress')" title="กำลังดำเนินการ">
                            <i class="bi bi-play"></i>
                        </button>
                    ` : '<span class="text-success">เสร็จแล้ว</span>'}
                </td>
            </tr>
        `;
    });

    tableHTML += '</tbody></table></div>';
    return tableHTML;
}

async function updateTaskStatus(taskId, status) {
    const completed_at = status === 'Completed' ? new Date().toISOString() : null;
    
    try {
        const response = await fetch(`/api/tasks/${taskId}`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ status, completed_at })
        });

        if (response.ok) {
            loadTasksDashboard();
            loadAllTasks();
            showNotification('อัพเดตสถานะงานเรียบร้อยแล้ว', 'success');
        } else {
            showNotification('เกิดข้อผิดพลาดในการอัพเดตสถานะ', 'danger');
        }
    } catch (error) {
        console.error('Error:', error);
        showNotification('เกิดข้อผิดพลาดในการเชื่อมต่อ', 'danger');
    }
}

function getPriorityBadgeClass(priority) {
    const classes = {
        'Low': 'bg-secondary',
        'Medium': 'bg-primary',
        'High': 'bg-warning',
        'Urgent': 'bg-danger'
    };
    return classes[priority] || 'bg-secondary';
}

function getStatusBadgeClass(status) {
    const classes = {
        'Pending': 'bg-secondary',
        'In Progress': 'bg-primary',
        'Completed': 'bg-success',
        'Cancelled': 'bg-dark'
    };
    return classes[status] || 'bg-secondary';
}

function getStatusText(status) {
    const texts = {
        'Pending': 'รอดำเนินการ',
        'In Progress': 'กำลังดำเนินการ',
        'Completed': 'เสร็จแล้ว',
        'Cancelled': 'ยกเลิก'
    };
    return texts[status] || status;
}

function quickFilter(filterType) {
    // ล้างตัวกรองเดิม
    clearFilters();
    
    const today = new Date();
    const sevenDaysAgo = new Date(today.getTime() - (7 * 24 * 60 * 60 * 1000));
    
    switch(filterType) {
        case 'high_value':
            // Filter customers with contract value > 100,000
            filteredCustomers = allCustomers.filter(customer => 
                customer.contract_value && customer.contract_value > 100000
            );
            break;
            
        case 'recent':
            // Filter customers created in last 7 days
            filteredCustomers = allCustomers.filter(customer => 
                new Date(customer.created_at) >= sevenDaysAgo
            );
            break;
            
        case 'no_contact':
            // Filter customers with no contract value
            filteredCustomers = allCustomers.filter(customer => 
                !customer.contract_value || customer.contract_value === 0
            );
            break;
            
        case 'online_leads':
            document.getElementById('leadSourceFilter').value = 'Online';
            document.getElementById('leadSourceFilterMobile').value = 'Online';
            filterAndSort();
            return;
    }
    
    sortCustomers();
    displayPaginatedCustomers();
}

function formatCurrency(amount) {
    return new Intl.NumberFormat('th-TH', { 
        style: 'currency', 
        currency: 'THB' 
    }).format(amount);
}

// Advanced search functionality
let advancedSearchCriteria = {};

function showAdvancedSearch() {
    const advancedSearchHTML = `
        <div class="modal fade" id="advancedSearchModal" tabindex="-1">
            <div class="modal-dialog modal-lg">
                <div class="modal-content">
                    <div class="modal-header">
                        <h5 class="modal-title">ค้นหาขั้นสูง</h5>
                        <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
                    </div>
                    <div class="modal-body">
                        <form id="advancedSearchForm">
                            <div class="row">
                                <div class="col-md-6 mb-3">
                                    <label class="form-label">ชื่อบริษัท</label>
                                    <input type="text" class="form-control" name="company_name" placeholder="ค้นหาชื่อบริษัท">
                                </div>
                                <div class="col-md-6 mb-3">
                                    <label class="form-label">อีเมล</label>
                                    <input type="text" class="form-control" name="email" placeholder="ค้นหาอีเมล">
                                </div>
                                <div class="col-md-6 mb-3">
                                    <label class="form-label">เบอร์โทรศัพท์</label>
                                    <input type="text" class="form-control" name="phone_number" placeholder="ค้นหาเบอร์โทร">
                                </div>
                                <div class="col-md-6 mb-3">
                                    <label class="form-label">ชื่อผู้ติดต่อ</label>
                                    <input type="text" class="form-control" name="contact_names" placeholder="ค้นหาชื่อผู้ติดต่อ">
                                </div>
                                <div class="col-md-6 mb-3">
                                    <label class="form-label">ประเภทธุรกิจ</label>
                                    <input type="text" class="form-control" name="business_type" placeholder="ค้นหาประเภทธุรกิจ">
                                </div>
                                <div class="col-md-6 mb-3">
                                    <label class="form-label">งบประมาณ (ตั้งแต่)</label>
                                    <input type="number" class="form-control" name="budget_from" placeholder="0">
                                </div>
                                <div class="col-md-6 mb-3">
                                    <label class="form-label">งบประมาณ (ถึง)</label>
                                    <input type="number" class="form-control" name="budget_to" placeholder="9999999">
                                </div>
                                <div class="col-md-6 mb-3">
                                    <label class="form-label">Contract Value (ตั้งแต่)</label>
                                    <input type="number" class="form-control" name="contract_value_from" placeholder="0">
                                </div>
                                <div class="col-md-6 mb-3">
                                    <label class="form-label">Contract Value (ถึง)</label>
                                    <input type="number" class="form-control" name="contract_value_to" placeholder="9999999">
                                </div>
                                <div class="col-md-6 mb-3">
                                    <label class="form-label">วันที่สร้าง (ตั้งแต่)</label>
                                    <input type="date" class="form-control" name="created_from">
                                </div>
                                <div class="col-md-6 mb-3">
                                    <label class="form-label">วันที่สร้าง (ถึง)</label>
                                    <input type="date" class="form-control" name="created_to">
                                </div>
                                <div class="col-md-6 mb-3">
                                    <label class="form-label">ที่ตั้ง</label>
                                    <input type="text" class="form-control" name="location" placeholder="ค้นหาที่ตั้ง">
                                </div>
                                <div class="col-md-12 mb-3">
                                    <label class="form-label">Pain Points</label>
                                    <input type="text" class="form-control" name="pain_points" placeholder="ค้นหาปัญหาที่ต้องการแก้ไข">
                                </div>
                            </div>
                        </form>
                    </div>
                    <div class="modal-footer">
                        <button type="button" class="btn btn-secondary" onclick="clearAdvancedSearch()">ล้างทั้งหมด</button>
                        <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">ยกเลิก</button>
                        <button type="button" class="btn btn-primary" onclick="executeAdvancedSearch()">ค้นหา</button>
                    </div>
                </div>
            </div>
        </div>
    `;

    document.body.insertAdjacentHTML('beforeend', advancedSearchHTML);
    const modal = new bootstrap.Modal(document.getElementById('advancedSearchModal'));
    modal.show();

    document.getElementById('advancedSearchModal').addEventListener('hidden.bs.modal', function () {
        this.remove();
    });
}

function executeAdvancedSearch() {
    const form = document.getElementById('advancedSearchForm');
    const formData = new FormData(form);
    
    advancedSearchCriteria = {};
    
    // เก็บเกณฑ์การค้นหา
    for (let [key, value] of formData.entries()) {
        if (value.trim()) {
            advancedSearchCriteria[key] = value.trim();
        }
    }
    
    currentPage = 1;
    filterAndSort();
    
    document.getElementById('advancedSearchModal').querySelector('[data-bs-dismiss="modal"]').click();
    
    // แสดงสถานะการค้นหาขั้นสูง
    updateSearchStatus();
}

function clearAdvancedSearch() {
    document.getElementById('advancedSearchForm').reset();
    advancedSearchCriteria = {};
    updateSearchStatus();
}

function updateSearchStatus() {
    const hasAdvancedSearch = Object.keys(advancedSearchCriteria).length > 0;
    const statusElement = document.getElementById('advancedSearchStatus');
    
    if (statusElement) {
        statusElement.remove();
    }
    
    if (hasAdvancedSearch) {
        const searchCount = Object.keys(advancedSearchCriteria).length;
        const statusHTML = `
            <div id="advancedSearchStatus" class="alert alert-info alert-dismissible fade show" role="alert">
                <i class="bi bi-info-circle"></i> กำลังใช้การค้นหาขั้นสูง (${searchCount} เงื่อนไข)
                <button type="button" class="btn-close" onclick="clearAllAdvancedSearch()"></button>
            </div>
        `;
        document.querySelector('#customersList .card-body').insertAdjacentHTML('afterbegin', statusHTML);
    }
}

function clearAllAdvancedSearch() {
    advancedSearchCriteria = {};
    currentPage = 1;
    filterAndSort();
    updateSearchStatus();
}

// Contact modal functions
async function showContactModal(customerId) {
    try {
        const [customerRes, contactsRes] = await Promise.all([
            fetch(`/api/customers/${customerId}`),
            fetch(`/api/customers/${customerId}/contacts`)
        ]);

        const customer = await customerRes.json();
        const contacts = await contactsRes.json();

        const contactModalHTML = `
            <div class="modal fade" id="contactModal" tabindex="-1">
                <div class="modal-dialog modal-xl">
                    <div class="modal-content">
                        <div class="modal-header">
                            <h5 class="modal-title">อัพเดตการติดต่อ - ${customer.company_name}</h5>
                            <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
                        </div>
                        <div class="modal-body">
                            <div class="row">
                                <div class="col-md-5">
                                    <h6>เพิ่มการติดต่อใหม่</h6>
                                    <form id="contactForm">
                                        <div class="mb-3">
                                            <label class="form-label">วันที่ติดต่อ</label>
                                            <input type="datetime-local" class="form-control" name="contact_date" value="${new Date().toISOString().slice(0, 16)}" required>
                                        </div>
                                        <div class="mb-3">
                                            <label class="form-label">ประเภทการติดต่อ</label>
                                            <select class="form-select" name="contact_type" required>
                                                <option value="">เลือกประเภท</option>
                                                <option value="เริ่มต้น">เริ่มต้น</option>
                                                <option value="ติดตาม">ติดตาม</option>
                                                <option value="นำเสนอ">นำเสนอ</option>
                                                <option value="เจรจา">เจรจา</option>
                                                <option value="ปิดการขาย">ปิดการขาย</option>
                                            </select>
                                        </div>
                                        <div class="mb-3">
                                            <label class="form-label">สถานะ</label>
                                            <select class="form-select" name="contact_status" required>
                                                <option value="">เลือกสถานะ</option>
                                                <option value="สนใจ">สนใจ</option>
                                                <option value="รอพิจารณา">รอพิจารณา</option>
                                                <option value="นัดหมาย">นัดหมาย</option>
                                                <option value="เจรจา">เจรจา</option>
                                                <option value="สำเร็จ">สำเร็จ</option>
                                                <option value="ไม่สำเร็จ">ไม่สำเร็จ</option>
                                                <option value="รอติดตาม">รอติดตาม</option>
                                            </select>
                                        </div>
                                        <div class="mb-3">
                                            <label class="form-label">ช่องทางติดต่อ</label>
                                            <select class="form-select" name="contact_method">
                                                <option value="">เลือกช่องทาง</option>
                                                <option value="โทรศัพท์">โทรศัพท์</option>
                                                <option value="อีเมล">อีเมล</option>
                                                <option value="LINE">LINE</option>
                                                <option value="พบหน้า">พบหน้า</option>
                                                <option value="วิดีโอคอล">วิดีโอคอล</option>
                                            </select>
                                        </div>
                                        <div class="mb-3">
                                            <label class="form-label">ผู้ติดต่อ</label>
                                            <input type="text" class="form-control" name="contact_person" placeholder="ชื่อผู้ติดต่อ">
                                        </div>
                                        <div class="mb-3">
                                            <label class="form-label">รายละเอียดการติดต่อ</label>
                                            <textarea class="form-control" name="contact_details" rows="3" placeholder="บันทึกรายละเอียดการติดต่อ"></textarea>
                                        </div>
                                        <div class="mb-3">
                                            <label class="form-label">วันติดตามครั้งต่อไป</label>
                                            <input type="date" class="form-control" name="next_follow_up">
                                        </div>
                                        <div class="mb-3">
                                            <label class="form-label">หมายเหตุ</label>
                                            <textarea class="form-control" name="notes" rows="2" placeholder="หมายเหตุเพิ่มเติม"></textarea>
                                        </div>
                                        <div class="mb-3">
                                            <label class="form-label">ผู้บันทึก</label>
                                            <input type="text" class="form-control" name="created_by" placeholder="ชื่อผู้บันทึก" value="Admin">
                                        </div>
                                        <button type="submit" class="btn btn-primary w-100">บันทึกการติดต่อ</button>
                                    </form>
                                </div>
                                <div class="col-md-7">
                                    <h6>ประวัติการติดต่อทั้งหมด (${contacts.length} รายการ)</h6>
                                    <div id="contactHistory" style="max-height: 500px; overflow-y: auto;">
                                        ${generateContactHistory(contacts)}
                                    </div>
                                </div>
                            </div>
                        </div>
                        <div class="modal-footer">
                            <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">ปิด</button>
                        </div>
                    </div>
                </div>
            </div>
        `;

        document.body.insertAdjacentHTML('beforeend', contactModalHTML);
        const modal = new bootstrap.Modal(document.getElementById('contactModal'));
        modal.show();

        document.getElementById('contactForm').addEventListener('submit', function(e) {
            e.preventDefault();
            addContactLog(customerId);
        });

        document.getElementById('contactModal').addEventListener('hidden.bs.modal', function () {
            this.remove();
        });

    } catch (error) {
        console.error('Error:', error);
        alert('เกิดข้อผิดพลาดในการโหลดข้อมูล');
    }
}

function generateContactHistory(contacts) {
    if (contacts.length === 0) {
        return '<div class="text-center text-muted py-3">ยังไม่มีประวัติการติดต่อ</div>';
    }

    return contacts.map(contact => `
        <div class="card mb-2">
            <div class="card-body p-3">
                <div class="d-flex justify-content-between align-items-start mb-2">
                    <h6 class="mb-1">${contact.contact_type || '-'}</h6>
                    <small class="text-muted">${new Date(contact.contact_date).toLocaleString('th-TH')}</small>
                </div>
                <div class="row">
                    <div class="col-sm-6">
                        <small><strong>สถานะ:</strong> <span class="badge bg-secondary">${contact.contact_status || '-'}</span></small>
                    </div>
                    <div class="col-sm-6">
                        <small><strong>ช่องทาง:</strong> ${contact.contact_method || '-'}</small>
                    </div>
                </div>
                ${contact.contact_person ? `<div class="mt-1"><small><strong>ผู้ติดต่อ:</strong> ${contact.contact_person}</small></div>` : ''}
                ${contact.contact_details ? `<div class="mt-1"><small><strong>รายละเอียด:</strong> ${contact.contact_details}</small></div>` : ''}
                ${contact.next_follow_up ? `<div class="mt-1"><small><strong>ติดตามครั้งต่อไป:</strong> ${new Date(contact.next_follow_up).toLocaleDateString('th-TH')}</small></div>` : ''}
                ${contact.notes ? `<div class="mt-1"><small><strong>หมายเหตุ:</strong> ${contact.notes}</small></div>` : ''}
                <div class="mt-1"><small class="text-muted">บันทึกโดย: ${contact.created_by || 'ไม่ระบุ'}</small></div>
            </div>
        </div>
    `).join('');
}

async function addContactLog(customerId) {
    const form = document.getElementById('contactForm');
    const formData = new FormData(form);

    const contactData = {
        contact_type: formData.get('contact_type'),
        contact_status: formData.get('contact_status'),
        contact_method: formData.get('contact_method'),
        contact_person: formData.get('contact_person'),
        contact_details: formData.get('contact_details'),
        next_follow_up: formData.get('next_follow_up') || null,
        notes: formData.get('notes'),
        created_by: formData.get('created_by')
    };

    try {
        const response = await fetch(`/api/customers/${customerId}/contacts`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(contactData)
        });

        if (response.ok) {
            showNotification('บันทึกการติดต่อเรียบร้อยแล้ว', 'success');
            document.getElementById('contactModal').querySelector('[data-bs-dismiss="modal"]').click();
        } else {
            showNotification('เกิดข้อผิดพลาดในการบันทึกข้อมูล', 'danger');
        }
    } catch (error) {
        console.error('Error:', error);
        showNotification('เกิดข้อผิดพลาดในการเชื่อมต่อ', 'danger');
    }
}

// Task modal functions
async function showTaskModal(customerId, companyName) {
    const taskModalHTML = `
        <div class="modal fade" id="taskModal" tabindex="-1">
            <div class="modal-dialog modal-lg">
                <div class="modal-content">
                    <div class="modal-header">
                        <h5 class="modal-title">จัดการงาน - ${companyName}</h5>
                        <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
                    </div>
                    <div class="modal-body">
                        <form id="taskForm">
                            <div class="row">
                                <div class="col-md-6 mb-3">
                                    <label class="form-label">ชื่องาน *</label>
                                    <input type="text" class="form-control" name="title" required>
                                </div>
                                <div class="col-md-6 mb-3">
                                    <label class="form-label">ประเภทงาน *</label>
                                    <select class="form-select" name="task_type" required>
                                        <option value="">เลือกประเภท</option>
                                        <option value="ติดตาม">ติดตาม</option>
                                        <option value="นำเสนอ">นำเสนอ</option>
                                        <option value="เจรจา">เจรจา</option>
                                        <option value="ส่งเอกสาร">ส่งเอกสาร</option>
                                        <option value="นัดหมาย">นัดหมาย</option>
                                        <option value="อื่นๆ">อื่นๆ</option>
                                    </select>
                                </div>
                                <div class="col-md-12 mb-3">
                                    <label class="form-label">รายละเอียด</label>
                                    <textarea class="form-control" name="description" rows="2"></textarea>
                                </div>
                                <div class="col-md-6 mb-3">
                                    <label class="form-label">ความสำคัญ</label>
                                    <select class="form-select" name="priority">
                                        <option value="Low">ต่ำ</option>
                                        <option value="Medium" selected>ปานกลาง</option>
                                        <option value="High">สูง</option>
                                        <option value="Urgent">ด่วน</option>
                                    </select>
                                </div>
                                <div class="col-md-6 mb-3">
                                    <label class="form-label">ผู้รับผิดชอบ</label>
                                    <select class="form-select" name="assigned_to">
                                        <option value="">เลือกผู้รับผิดชอบ</option>
                                        <option value="Aui">Aui</option>
                                        <option value="Ink">Ink</option>
                                        <option value="Puri">Puri</option>
                                    </select>
                                </div>
                                <div class="col-md-6 mb-3">
                                    <label class="form-label">กำหนดเสร็จ</label>
                                    <input type="date" class="form-control" name="due_date">
                                </div>
                                <div class="col-md-6 mb-3">
                                    <label class="form-label">แจ้งเตือนก่อน</label>
                                    <input type="datetime-local" class="form-control" name="reminder_date">
                                </div>
                                <div class="col-md-6 mb-3">
                                    <label class="form-label">ผู้สร้าง</label>
                                    <input type="text" class="form-control" name="created_by" value="Admin">
                                </div>
                            </div>
                            <button type="submit" class="btn btn-primary w-100">สร้างงาน</button>
                        </form>
                    </div>
                    <div class="modal-footer">
                        <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">ปิด</button>
                    </div>
                </div>
            </div>
        </div>
    `;

    document.body.insertAdjacentHTML('beforeend', taskModalHTML);
    const modal = new bootstrap.Modal(document.getElementById('taskModal'));
    modal.show();

    document.getElementById('taskForm').addEventListener('submit', function(e) {
        e.preventDefault();
        addTask(customerId);
    });

    document.getElementById('taskModal').addEventListener('hidden.bs.modal', function () {
        this.remove();
    });
}

async function addTask(customerId) {
    const form = document.getElementById('taskForm');
    const formData = new FormData(form);

    const taskData = {
        title: formData.get('title'),
        description: formData.get('description'),
        task_type: formData.get('task_type'),
        priority: formData.get('priority'),
        assigned_to: formData.get('assigned_to'),
        due_date: formData.get('due_date') || null,
        reminder_date: formData.get('reminder_date') || null,
        created_by: formData.get('created_by')
    };

    try {
        const response = await fetch(`/api/customers/${customerId}/tasks`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(taskData)
        });

        if (response.ok) {
            showNotification('สร้างงานเรียบร้อยแล้ว', 'success');
            document.getElementById('taskModal').querySelector('[data-bs-dismiss="modal"]').click();
        } else {
            showNotification('เกิดข้อผิดพลาดในการสร้างงาน', 'danger');
        }
    } catch (error) {
        console.error('Error:', error);
        showNotification('เกิดข้อผิดพลาดในการเชื่อมต่อ', 'danger');
    }
}

// Handle window resize for responsive table
window.addEventListener('resize', debounce(function() {
    if (filteredCustomers.length > 0) {
        const startIndex = (currentPage - 1) * itemsPerPage;
        const endIndex = startIndex + itemsPerPage;
        const paginatedData = filteredCustomers.slice(startIndex, endIndex);
        displayCustomers(paginatedData);
    }
}, 250));