// Subscriptions management module
class SubscriptionManager {
    constructor() {
        this.supabase = window.supabaseClient;
        this.subscriptions = [];
        this.realtimeChannel = null;
        this.showInactive = false;
    }

    // Initialize real-time subscription
    async init() {
        await this.loadSubscriptions();
        this.setupRealtimeListener();
        this.render();
    }

    // Load subscriptions from database
    async loadSubscriptions() {
        try {
            const { data, error } = await this.supabase
                .from('subscriptions')
                .select('*')
                .order('created_at', { ascending: false });

            if (error) throw error;
            this.subscriptions = data || [];
            return { success: true };
        } catch (error) {
            console.error('Error loading subscriptions:', error);
            return { success: false, error: error.message };
        }
    }

    // Setup real-time listener for subscription changes
    setupRealtimeListener() {
        const user = window.authManager.getUser();
        if (!user) return;

        // Remove existing channel if any
        if (this.realtimeChannel) {
            this.supabase.removeChannel(this.realtimeChannel);
        }

        // Create new channel for real-time updates
        this.realtimeChannel = this.supabase
            .channel('subscriptions-changes')
            .on('postgres_changes',
                {
                    event: '*',
                    schema: 'public',
                    table: 'subscriptions',
                    filter: `user_id=eq.${user.id}`
                },
                (payload) => {
                    console.log('Real-time change:', payload);
                    this.handleRealtimeChange(payload);
                }
            )
            .subscribe();
    }

    // Handle real-time database changes
    handleRealtimeChange(payload) {
        if (payload.eventType === 'INSERT') {
            this.subscriptions.unshift(payload.new);
        } else if (payload.eventType === 'UPDATE') {
            const index = this.subscriptions.findIndex(s => s.id === payload.new.id);
            if (index !== -1) {
                this.subscriptions[index] = payload.new;
            }
        } else if (payload.eventType === 'DELETE') {
            this.subscriptions = this.subscriptions.filter(s => s.id !== payload.old.id);
        }
        this.render();
    }

    // Add new subscription
    async addSubscription(subscriptionData) {
        try {
            const user = window.authManager.getUser();
            if (!user) throw new Error('User not authenticated');

            const { data, error } = await this.supabase
                .from('subscriptions')
                .insert([{
                    user_id: user.id,
                    ...subscriptionData,
                    created_at: new Date().toISOString(),
                    updated_at: new Date().toISOString()
                }])
                .select();

            if (error) throw error;
            return { success: true, data };
        } catch (error) {
            console.error('Error adding subscription:', error);
            return { success: false, error: error.message };
        }
    }

    // Update subscription
    async updateSubscription(id, updates) {
        try {
            const { data, error } = await this.supabase
                .from('subscriptions')
                .update({
                    ...updates,
                    updated_at: new Date().toISOString()
                })
                .eq('id', id)
                .select();

            if (error) throw error;
            return { success: true, data };
        } catch (error) {
            console.error('Error updating subscription:', error);
            return { success: false, error: error.message };
        }
    }

    // Delete subscription
    async deleteSubscription(id) {
        try {
            const { error } = await this.supabase
                .from('subscriptions')
                .delete()
                .eq('id', id);

            if (error) throw error;
            return { success: true };
        } catch (error) {
            console.error('Error deleting subscription:', error);
            return { success: false, error: error.message };
        }
    }

    // Toggle subscription active status
    async toggleActive(id) {
        const subscription = this.subscriptions.find(s => s.id === id);
        if (!subscription) return { success: false, error: 'Subscription not found' };

        return await this.updateSubscription(id, { active: !subscription.active });
    }

    // Calculate monthly cost (normalize all to monthly)
    calculateMonthlyCost(cost, billingCycle) {
        switch (billingCycle.toLowerCase()) {
            case 'monthly':
                return parseFloat(cost);
            case 'yearly':
                return parseFloat(cost) / 12;
            case 'weekly':
                return parseFloat(cost) * 52 / 12;
            default:
                return parseFloat(cost);
        }
    }

    // Calculate yearly cost
    calculateYearlyCost(cost, billingCycle) {
        switch (billingCycle.toLowerCase()) {
            case 'monthly':
                return parseFloat(cost) * 12;
            case 'yearly':
                return parseFloat(cost);
            case 'weekly':
                return parseFloat(cost) * 52;
            default:
                return parseFloat(cost) * 12;
        }
    }

    // Get active subscriptions
    getActiveSubscriptions() {
        return this.subscriptions.filter(s => s.active);
    }

    // Get all subscriptions (filtered by showInactive setting)
    getDisplaySubscriptions() {
        return this.showInactive
            ? this.subscriptions
            : this.getActiveSubscriptions();
    }

    // Calculate total costs
    calculateTotals() {
        const activeSubscriptions = this.getActiveSubscriptions();

        const totalMonthly = activeSubscriptions.reduce((sum, sub) => {
            return sum + this.calculateMonthlyCost(sub.cost, sub.billing_cycle);
        }, 0);

        const totalYearly = activeSubscriptions.reduce((sum, sub) => {
            return sum + this.calculateYearlyCost(sub.cost, sub.billing_cycle);
        }, 0);

        return { totalMonthly, totalYearly };
    }

    // Format currency
    formatCurrency(amount, currency = 'USD') {
        return new Intl.NumberFormat('en-US', {
            style: 'currency',
            currency: currency
        }).format(amount);
    }

    // Format date
    formatDate(dateString) {
        if (!dateString) return 'Not set';
        const date = new Date(dateString);
        return date.toLocaleDateString('en-US', {
            year: 'numeric',
            month: 'short',
            day: 'numeric'
        });
    }

    // Render subscriptions
    render() {
        this.renderSubscriptionsList();
        this.renderTotals();
    }

    // Render subscriptions list
    renderSubscriptionsList() {
        const container = document.getElementById('subscriptions-list');
        if (!container) return;

        const subscriptions = this.getDisplaySubscriptions();

        if (subscriptions.length === 0) {
            container.innerHTML = `
                <div class="empty-state">
                    <p>No subscriptions yet. Click "+ Add Subscription" to get started!</p>
                </div>
            `;
            return;
        }

        container.innerHTML = subscriptions.map(sub => `
            <div class="subscription-card ${!sub.active ? 'inactive' : ''}" data-id="${sub.id}">
                <div class="subscription-header">
                    <h3 class="subscription-name">${this.escapeHtml(sub.name)}</h3>
                    <div class="subscription-actions">
                        <button class="btn-icon" onclick="subscriptionManager.editSubscription('${sub.id}')" title="Edit">
                            ✏️
                        </button>
                        <button class="btn-icon" onclick="subscriptionManager.confirmDelete('${sub.id}')" title="Delete">
                            🗑️
                        </button>
                    </div>
                </div>
                <div class="subscription-body">
                    <div class="subscription-cost">
                        <span class="cost-amount">${this.formatCurrency(sub.cost, sub.currency)}</span>
                        <span class="cost-cycle">/ ${sub.billing_cycle}</span>
                    </div>
                    ${sub.category ? `<div class="subscription-category">${this.escapeHtml(sub.category)}</div>` : ''}
                    <div class="subscription-date">
                        <span>Next billing: ${this.formatDate(sub.next_billing_date)}</span>
                    </div>
                    ${sub.description ? `<div class="subscription-description">${this.escapeHtml(sub.description)}</div>` : ''}
                </div>
                <div class="subscription-footer">
                    <label class="toggle-label">
                        <input type="checkbox" ${sub.active ? 'checked' : ''}
                               onchange="subscriptionManager.toggleActive('${sub.id}')">
                        <span>${sub.active ? 'Active' : 'Inactive'}</span>
                    </label>
                    <span class="subscription-monthly">
                        ${this.formatCurrency(this.calculateMonthlyCost(sub.cost, sub.billing_cycle), sub.currency)}/mo
                    </span>
                </div>
            </div>
        `).join('');
    }

    // Render totals
    renderTotals() {
        const { totalMonthly, totalYearly } = this.calculateTotals();
        const activeCount = this.getActiveSubscriptions().length;

        const totalMonthlyEl = document.getElementById('total-monthly');
        const totalYearlyEl = document.getElementById('total-yearly');
        const activeCountEl = document.getElementById('active-count');

        if (totalMonthlyEl) totalMonthlyEl.textContent = this.formatCurrency(totalMonthly);
        if (totalYearlyEl) totalYearlyEl.textContent = this.formatCurrency(totalYearly);
        if (activeCountEl) activeCountEl.textContent = activeCount;
    }

    // Edit subscription
    editSubscription(id) {
        const subscription = this.subscriptions.find(s => s.id === id);
        if (!subscription) return;

        // Populate form with subscription data
        document.getElementById('subscription-id').value = id;
        document.getElementById('name').value = subscription.name;
        document.getElementById('cost').value = subscription.cost;
        document.getElementById('currency').value = subscription.currency;
        document.getElementById('billing-cycle').value = subscription.billing_cycle;
        document.getElementById('next-billing-date').value = subscription.next_billing_date
            ? subscription.next_billing_date.split('T')[0]
            : '';
        document.getElementById('category').value = subscription.category || '';
        document.getElementById('description').value = subscription.description || '';

        // Update form button text and title
        document.getElementById('submit-btn').textContent = 'Update Subscription';
        document.getElementById('form-title').textContent = 'Edit Subscription';

        // Open the form slider
        if (window.openSubscriptionForm) {
            window.openSubscriptionForm(true);
        }
    }

    // Confirm delete
    confirmDelete(id) {
        const subscription = this.subscriptions.find(s => s.id === id);
        if (!subscription) return;

        if (confirm(`Are you sure you want to delete "${subscription.name}"?`)) {
            this.deleteSubscription(id);
        }
    }

    // Escape HTML to prevent XSS
    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    // Toggle show inactive
    toggleShowInactive() {
        this.showInactive = !this.showInactive;
        this.render();
    }

    // Cleanup
    cleanup() {
        if (this.realtimeChannel) {
            this.supabase.removeChannel(this.realtimeChannel);
        }
    }
}

// Create global subscription manager instance
window.subscriptionManager = new SubscriptionManager();
