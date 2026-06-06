export type Lang = 'en' | 'ar'

export const t = {
  en: {
    // Brand
    appName: 'Adam Store',
    appTagline: 'Manufacturing Tracker',

    // Auth
    login: 'Sign In',
    logout: 'Sign Out',
    email: 'Email Address',
    password: 'Password',
    loginTitle: 'Welcome Back',
    loginSubtitle: 'Sign in to your account',
    loggingIn: 'Signing in…',
    loginError: 'Invalid email or password.',

    // Navigation
    dashboard: 'Dashboard',
    orders: 'Orders',
    newOrder: 'New Order',
    myOrders: 'My Orders',
    users: 'Users',
    settings: 'Settings',

    // Roles
    manager: 'Manager',
    worker: 'Worker',
    customer: 'Customer',

    // Stages
    draft: 'Draft',
    preparation: 'Preparation',
    cutting_printing: 'Cutting & Printing',
    finishing: 'Finishing',
    submitted: 'Submitted to Customer',

    // Stage short labels
    draft_short: 'Draft',
    preparation_short: 'Prep',
    cutting_printing_short: 'C&P',
    finishing_short: 'Finish',
    submitted_short: 'Done',

    // Order fields
    orderNumber: 'Order #',
    customerName: 'Customer Name',
    customerPhone: 'Phone',
    currentStage: 'Current Stage',
    status: 'Status',
    createdAt: 'Created',
    updatedAt: 'Updated',
    actions: 'Actions',

    // Statuses
    active: 'Active',
    completed: 'Completed',
    cancelled: 'Cancelled',

    // Buttons
    save: 'Save',
    cancel: 'Cancel',
    edit: 'Edit',
    delete: 'Delete',
    view: 'View',
    advance: 'Advance to Next Stage',
    markComplete: 'Mark Stage Complete',
    createOrder: 'Create Order',
    saving: 'Saving…',
    back: 'Back',
    confirm: 'Confirm',

    // Dashboard
    totalOrders: 'Total Orders',
    activeOrders: 'Active Orders',
    completedOrders: 'Completed Orders',
    recentOrders: 'Recent Orders',
    pipeline: 'Pipeline Overview',
    noOrders: 'No orders found.',

    // Draft stage fields
    fabricDescription: 'Fabric Description',
    quantity: 'Quantity (pcs)',
    sizeDetails: 'Size Details',
    designNotes: 'Design Notes',
    deadline: 'Deadline',

    // Preparation stage fields
    materialsList: 'Materials List',
    fabricColor: 'Fabric Color',
    fabricQuantity: 'Fabric Quantity (m)',
    supplierName: 'Supplier Name',
    estimatedCost: 'Estimated Cost',

    // Cutting & Printing stage fields
    cuttingDate: 'Cutting Date',
    cuttingWorker: 'Cutting Worker',
    printingType: 'Printing Type',
    printingDetails: 'Printing Details',
    piecesCut: 'Pieces Cut',
    printingTypes: {
      none: 'None',
      screen: 'Screen Print',
      digital: 'Digital Print',
      embroidery: 'Embroidery',
    },

    // Finishing stage fields
    finishingType: 'Finishing Type',
    ironing: 'Ironing Done',
    packagingType: 'Packaging Type',
    qualityCheck: 'Quality Check Passed',
    qualityNotes: 'Quality Notes',
    finishingWorker: 'Finishing Worker',
    finishingTypes: {
      hand: 'Hand Finished',
      machine: 'Machine Finished',
    },

    // Submitted stage fields
    deliveryDate: 'Delivery Date',
    deliveryMethod: 'Delivery Method',
    trackingNumber: 'Tracking Number',
    deliveryAddress: 'Delivery Address',
    receivedConfirmation: 'Customer Received',
    deliveryMethods: {
      pickup: 'Pickup',
      delivery: 'Home Delivery',
      courier: 'Courier',
    },

    // Common
    notes: 'Notes',
    stageCompleted: 'Stage Completed',
    completedBy: 'Completed by',
    completedAt: 'Completed at',
    lastUpdated: 'Last updated',
    yes: 'Yes',
    no: 'No',
    loading: 'Loading…',
    error: 'Something went wrong.',
    notFound: 'Not found.',
    required: 'Required',
    deleteConfirm: 'Are you sure you want to delete this order? This cannot be undone.',
    advanceConfirm: 'Advance this order to the next stage?',
    noPermission: 'You do not have permission to edit this stage.',
    stageNote: 'Stage Notes',
    orderDetails: 'Order Details',
    stageData: 'Stage Data',
    assignedStage: 'Assigned Stage',
    allStages: 'All Stages',
    searchOrders: 'Search orders…',
    filterByStage: 'Filter by stage',
    filterByStatus: 'Filter by status',
    all: 'All',

    productPhotos: 'Product Photos',
    uploadPhotos: 'Upload Photos',
    uploading: 'Uploading…',
    deletePhoto: 'Delete photo',
    noPhotos: 'No photos uploaded yet.',
    clickToUploadPhotos: 'Click here or drag photos to upload',
  },

  ar: {
    appName: 'آدم ستور',
    appTagline: 'متتبع الإنتاج',

    login: 'تسجيل الدخول',
    logout: 'تسجيل الخروج',
    email: 'البريد الإلكتروني',
    password: 'كلمة المرور',
    loginTitle: 'مرحباً بعودتك',
    loginSubtitle: 'سجّل دخولك إلى حسابك',
    loggingIn: 'جارٍ الدخول…',
    loginError: 'البريد الإلكتروني أو كلمة المرور غير صحيحة.',

    dashboard: 'لوحة التحكم',
    orders: 'الطلبات',
    newOrder: 'طلب جديد',
    myOrders: 'طلباتي',
    users: 'المستخدمون',
    settings: 'الإعدادات',

    manager: 'مدير',
    worker: 'عامل',
    customer: 'عميل',

    draft: 'مسودة',
    preparation: 'التحضير',
    cutting_printing: 'القص والطباعة',
    finishing: 'التشطيب',
    submitted: 'تسليم للعميل',

    draft_short: 'مسودة',
    preparation_short: 'تحضير',
    cutting_printing_short: 'قص',
    finishing_short: 'تشطيب',
    submitted_short: 'تسليم',

    orderNumber: 'رقم الطلب',
    customerName: 'اسم العميل',
    customerPhone: 'الهاتف',
    currentStage: 'المرحلة الحالية',
    status: 'الحالة',
    createdAt: 'تاريخ الإنشاء',
    updatedAt: 'آخر تحديث',
    actions: 'الإجراءات',

    active: 'نشط',
    completed: 'مكتمل',
    cancelled: 'ملغي',

    save: 'حفظ',
    cancel: 'إلغاء',
    edit: 'تعديل',
    delete: 'حذف',
    view: 'عرض',
    advance: 'الانتقال للمرحلة التالية',
    markComplete: 'تحديد المرحلة كمكتملة',
    createOrder: 'إنشاء طلب',
    saving: 'جارٍ الحفظ…',
    back: 'رجوع',
    confirm: 'تأكيد',

    totalOrders: 'إجمالي الطلبات',
    activeOrders: 'الطلبات النشطة',
    completedOrders: 'الطلبات المكتملة',
    recentOrders: 'الطلبات الأخيرة',
    pipeline: 'نظرة عامة على الإنتاج',
    noOrders: 'لا توجد طلبات.',

    fabricDescription: 'وصف القماش',
    quantity: 'الكمية (قطعة)',
    sizeDetails: 'تفاصيل المقاسات',
    designNotes: 'ملاحظات التصميم',
    deadline: 'الموعد النهائي',

    materialsList: 'قائمة المواد',
    fabricColor: 'لون القماش',
    fabricQuantity: 'كمية القماش (م)',
    supplierName: 'اسم المورّد',
    estimatedCost: 'التكلفة التقديرية',

    cuttingDate: 'تاريخ القص',
    cuttingWorker: 'عامل القص',
    printingType: 'نوع الطباعة',
    printingDetails: 'تفاصيل الطباعة',
    piecesCut: 'القطع المقصوصة',
    printingTypes: {
      none: 'بدون طباعة',
      screen: 'طباعة سيلك',
      digital: 'طباعة رقمية',
      embroidery: 'تطريز',
    },

    finishingType: 'نوع التشطيب',
    ironing: 'تمّ الكيّ',
    packagingType: 'نوع التغليف',
    qualityCheck: 'اجتاز فحص الجودة',
    qualityNotes: 'ملاحظات الجودة',
    finishingWorker: 'عامل التشطيب',
    finishingTypes: {
      hand: 'تشطيب يدوي',
      machine: 'تشطيب آلي',
    },

    deliveryDate: 'تاريخ التسليم',
    deliveryMethod: 'طريقة التسليم',
    trackingNumber: 'رقم التتبع',
    deliveryAddress: 'عنوان التسليم',
    receivedConfirmation: 'استلام العميل',
    deliveryMethods: {
      pickup: 'استلام من المحل',
      delivery: 'توصيل للمنزل',
      courier: 'شركة شحن',
    },

    notes: 'ملاحظات',
    stageCompleted: 'المرحلة مكتملة',
    completedBy: 'أكملها',
    completedAt: 'وقت الاكتمال',
    lastUpdated: 'آخر تحديث',
    yes: 'نعم',
    no: 'لا',
    loading: 'جارٍ التحميل…',
    error: 'حدث خطأ ما.',
    notFound: 'غير موجود.',
    required: 'مطلوب',
    deleteConfirm: 'هل أنت متأكد من حذف هذا الطلب؟ لا يمكن التراجع.',
    advanceConfirm: 'هل تريد تقديم هذا الطلب للمرحلة التالية؟',
    noPermission: 'ليس لديك صلاحية لتعديل هذه المرحلة.',
    stageNote: 'ملاحظات المرحلة',
    orderDetails: 'تفاصيل الطلب',
    stageData: 'بيانات المرحلة',
    assignedStage: 'المرحلة المعيّنة',
    allStages: 'جميع المراحل',
    searchOrders: 'بحث في الطلبات…',
    filterByStage: 'تصفية حسب المرحلة',
    filterByStatus: 'تصفية حسب الحالة',
    all: 'الكل',

    productPhotos: 'صور المنتج',
    uploadPhotos: 'رفع صور',
    uploading: 'جارٍ الرفع…',
    deletePhoto: 'حذف الصورة',
    noPhotos: 'لا توجد صور مرفوعة بعد.',
    clickToUploadPhotos: 'اضغط هنا أو اسحب الصور للرفع',
  },
} as const

export type Translations = typeof t.en | typeof t.ar
