/**
 * Wallet & Transaction Methods
 * ~275 lines
 */
import { pb } from '../config.js'

function legacyWalletMutationsDisabledNotice(ctx) {
    ctx.showNotification(
        "Legacy GM wallet transactions are disabled. Use FM for wallet balance operations.",
        "error"
    );
}

function legacyWalletMutationsAreDisabled(ctx) {
    return ctx?.disableLegacyWalletMutations !== false;
}

export function openWalletModal(mode = 'add', wallet = null) {
    if (!this.isAdmin) {
        this.showNotification("Only administrators can manage wallets.", "error");
        return;
    }
    if (!this.isAuthenticated) {
        this.showNotification("You must be logged in to manage wallets.", "error");
        return;
    }
    
    this.walletModalMode = mode;
    this.walletModalSaving = false;
    
    if (mode === 'edit' && wallet) {
        this.walletModalData = { name: wallet.name, id: wallet.id };
    } else {
        this.walletModalData = { name: '', id: null };
    }
    
    this.showWalletModal = true;
}

export function closeWalletModal() {
    this.showWalletModal = false;
    this.walletModalData = { name: '', id: null };
    this.walletModalSaving = false;
}

export async function saveWallet() {
    if (!this.walletModalData.name.trim()) {
        this.showNotification("Please enter a wallet name.", "error");
        return;
    }
    
    this.walletModalSaving = true;
    
    try {
        const walletName = this.walletModalData.name.trim();
        const userName = this.getCurrentUserName();
        if (this.walletModalMode === 'add') {
            await pb.collection('wallets').create({
                name: walletName,
                balance: 0
            });
            await this.fetchWallets();
            this.logAction(`${userName} created wallet '${walletName}'`);
            this.showNotification("Wallet created successfully!", "success");
        } else {
            await pb.collection('wallets').update(this.walletModalData.id, { 
                name: walletName 
            });
            await this.fetchWallets();
            this.logAction(`${userName} updated wallet '${walletName}'`);
            this.showNotification("Wallet renamed successfully!", "success");
        }
        this.closeWalletModal();
    } catch (error) {
        this.walletModalSaving = false;
        this.showNotification("Error: " + (error.message || 'Unknown error'), "error");
    }
}

// Legacy functions for backwards compatibility
export async function addWallet() {
    this.openWalletModal('add');
}

export async function editWallet(w) {
    this.openWalletModal('edit', w);
}

export async function deleteWallet(id) {
    if (!this.isAdmin) {
        this.showNotification("Only administrators can delete wallets.", "error");
        return;
    }
    if (!this.isAuthenticated) {
        this.showNotification("You must be logged in to delete wallets.", "error");
        return;
    }
    
    try {
        const wallet = this.wallets.find(w => w.id === id);
        const walletName = wallet?.name || 'wallet';
        this.showLoading("Deleting wallet...");
        await pb.collection('wallets').delete(id);
        const userName = this.getCurrentUserName();
        this.logAction(`${userName} deleted wallet '${walletName}'`);
        await this.fetchWallets();
        this.hideLoading();
        this.showNotification("Wallet deleted successfully!", "success");
    } catch (error) {
        this.hideLoading();
        this.showNotification("Error: " + error.message, "error");
    }
}

export function openTransactionModal(wallet, type) {
    this.activeWallet = wallet;
    this.transType = type;
    this.transAmount = null;
    this.transDesc = '';
    this.transReceiptFile = null;
    // Reset donation fields
    this.depositType = 'standard';
    this.donationVisibility = 'anonymous';
    this.donorName = '';
    // Reset withdraw/transfer fields
    this.withdrawType = 'standard';
    this.destinationWallet = null;
    this.showTransModal = true;
}

export function resetTransactionForm() {
    this.transAmount = null;
    this.transDesc = '';
    this.transReceiptFile = null;
    this.depositType = 'standard';
    this.donationVisibility = 'anonymous';
    this.donorName = '';
    this.withdrawType = 'standard';
    this.destinationWallet = null;
}

export function handleTransReceiptFile(event) {
    const file = event.target.files && event.target.files[0];
    this.transReceiptFile = file || null;
}

export function hasTransactionReceipt(tx) {
    if (!tx || !tx.receipt) return false;
    if (Array.isArray(tx.receipt)) return tx.receipt.length > 0;
    if (typeof tx.receipt === 'string') return tx.receipt.length > 0;
    return !!tx.receipt;
}

export function getTransactionReceiptUrl(tx) {
    if (!tx || !tx.id) return '#';
    const baseUrl = pb.baseUrl || (typeof window !== 'undefined' ? window.location.origin : (import.meta.env.VITE_PB_URL || ''));
    const collId = tx.collectionId || 'transactions';
    const receipt = tx.receipt;
    const name = Array.isArray(receipt) ? receipt[0] : receipt;
    const filename = typeof name === 'object' ? (name && name.name) : name;
    if (!filename) return '#';
    return `${baseUrl}/api/files/${collId}/${tx.id}/${filename}`;
}

export async function processTransaction() {
    if (!this.isAuthenticated) {
        this.showNotification("You must be logged in to process transactions.", "error");
        return;
    }
    
    if (!this.isAdmin) {
        this.showNotification("Only administrators can process transactions.", "error");
        return;
    }
    
    if (!this.transAmount || this.transAmount <= 0) {
        this.showNotification("Invalid Amount", "error");
        return;
    }
    
    // Validate public donation has donor name
    if (this.transType === 'deposit' && this.depositType === 'donation' && this.donationVisibility === 'public' && !this.donorName.trim()) {
        this.showNotification("Please enter the donor name for public donations.", "error");
        return;
    }
    
    // Validate wallet transfer has destination
    if (this.transType === 'withdraw' && this.withdrawType === 'switch' && !this.destinationWallet) {
        this.showNotification("Please select a destination wallet.", "error");
        return;
    }
    
    // Validate sufficient funds for withdrawals/transfers
    if (this.transType === 'withdraw' && this.activeWallet.balance < this.transAmount) {
        this.showNotification("Insufficient Funds", "error");
        return;
    }
    
    // Deposit/donation require receipt file for reporting
    if (this.transType === 'deposit' && !this.transReceiptFile) {
        this.showNotification("Please upload a receipt or proof document for this deposit/donation.", "error");
        return;
    }

    // Legacy GM wallet balance mutations are intentionally disabled.
    if (legacyWalletMutationsAreDisabled(this)) {
        legacyWalletMutationsDisabledNotice(this);
        return;
    }

    try {
        this.showLoading("Processing transaction...");
        
        // Handle wallet transfer (switch wallet)
        if (this.transType === 'withdraw' && this.withdrawType === 'switch') {
            const destinationWallet = this.wallets.find(w => w.id === this.destinationWallet);
            if (!destinationWallet) {
                this.showNotification("Destination wallet not found.", "error");
                this.hideLoading();
                return;
            }
            
            // Update both wallet balances
            const sourceNewBalance = this.activeWallet.balance - this.transAmount;
            const destNewBalance = destinationWallet.balance + this.transAmount;
            
            await pb.collection('wallets').update(this.activeWallet.id, { balance: sourceNewBalance });
            await pb.collection('wallets').update(destinationWallet.id, { balance: destNewBalance });
            
            // Create two linked transactions
            const transferDate = new Date().toISOString();
            
            // Withdraw transaction from source
            await pb.collection('transactions').create({
                date: transferDate,
                wallet: this.activeWallet.id,
                type: 'WITHDRAW',
                amount: this.transAmount,
                description: `Transfer to ${destinationWallet.name}`
            });
            
            // Deposit transaction to destination
            await pb.collection('transactions').create({
                date: transferDate,
                wallet: destinationWallet.id,
                type: 'DEPOSIT',
                amount: this.transAmount,
                description: `Transfer from ${this.activeWallet.name}`
            });
            
            const userName = this.getCurrentUserName();
            this.logAction(`${userName} processed a transfer from ${this.activeWallet.name} to ${destinationWallet.name}`);
            this.showTransModal = false;
            this.resetTransactionForm();
            await this.fetchWallets();
            await this.fetchTransactions();
            this.hideLoading();
            this.showNotification(`Transfer completed: $${this.formatMoney(this.transAmount)} moved from ${this.activeWallet.name} to ${destinationWallet.name}`, "success");
            return;
        }
        
        // Handle regular deposit or withdrawal
        let newBalance = this.activeWallet.balance;
        if (this.transType === 'deposit') {
            newBalance += this.transAmount;
        } else {
            newBalance -= this.transAmount;
        }

        await pb.collection('wallets').update(this.activeWallet.id, { balance: newBalance });

        // Determine transaction type and description
        let transactionType = 'DEPOSIT';
        let transactionDescription = '';
        
        if (this.transType === 'deposit') {
            if (this.depositType === 'donation') {
                transactionType = 'DONATION';
                if (this.donationVisibility === 'anonymous') {
                    transactionDescription = 'Anonymous Donation';
                } else {
                    transactionDescription = `Donation from ${this.donorName.trim()}`;
                }
            } else {
                transactionType = 'DEPOSIT';
                transactionDescription = this.transDesc || 'Manual Deposit';
            }
            // Create deposit/donation with receipt file (FormData)
            const formData = new FormData();
            formData.append('date', new Date().toISOString());
            formData.append('wallet', this.activeWallet.id);
            formData.append('type', transactionType);
            formData.append('amount', String(this.transAmount));
            formData.append('description', transactionDescription);
            formData.append('receipt', this.transReceiptFile);
            await pb.collection('transactions').create(formData);
        } else {
            transactionType = 'WITHDRAW';
            transactionDescription = this.transDesc || 'Manual Withdrawal';
            await pb.collection('transactions').create({
                date: new Date().toISOString(),
                wallet: this.activeWallet.id,
                type: transactionType,
                amount: this.transAmount,
                description: transactionDescription
            });
        }

        const userName = this.getCurrentUserName();
        this.logAction(`${userName} processed a ${this.transType === 'deposit' ? 'deposit' : 'withdrawal'} on wallet '${this.activeWallet.name}'`);
        this.showTransModal = false;
        this.resetTransactionForm();
        await this.fetchWallets();
        await this.fetchTransactions();
        this.hideLoading();
        this.showNotification("Transaction processed successfully!", "success");
    } catch (error) {
        this.hideLoading();
        this.showNotification("Error: " + error.message, "error");
    }
}

export function getWalletName(id) {
    if (!id) return 'Multi-Source';
    const w = this.wallets.find(x => x.id === id);
    return w ? w.name : 'Unknown';
}
