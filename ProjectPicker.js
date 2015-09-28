Ext.define('ProjectPickerDialog', {
    extend: 'Rally.ui.dialog.Dialog',
    alias: 'widget.projectpickerdialog',


    height: 400,
    width: 600,
    layout: 'fit',
    closable: true,
    draggable: true,

    config: {
        /**
         * @cfg {String}
         * Title to give to the dialog
         */
        title: 'Choose an Item',

        /**
         * @cfg {Boolean}
         * Allow multiple selection or not
         */
        multiple: true,

        /**
         * @cfg {Object}
         * An {Ext.data.Store} config object used when building the grid
         * Handy when you need to limit the selection with store filters
         */
        storeConfig: {
            context: {
                project: null
            },
            sorters: [
                {
                    property: 'FormattedID',
                    direction: 'DESC'
                }
            ]
        },

        /**
         * @cfg {Ext.grid.Column}
         * List of columns that will be used in the chooser
         */
        columns: [
            {
                text: 'ID',
                dataIndex: 'ObjectID',
                renderer: _.identity
            },
            'Name'
        ],

        /**
         * @cfg {String}
         * Text to be displayed on the button when selection is complete
         */
        selectionButtonText: 'Done',

        /**
         * @cfg {Object}
         * The grid configuration to be used when creative the grid of items in the dialog
         */
        gridConfig: {},

        /**
         * @deprecated
         * @cfg {String}
         * The ref of a record to select when the chooser loads
         * Use selectedRecords instead
         */
        selectedRef: undefined,

        /**
         * @cfg {String}|{String[]}
         * The ref(s) of items which should be selected when the chooser loads
         */
        selectedRecords: undefined,

        /**
         * @cfg {Array}
         * The records to select when the chooser loads
         */
        initialSelectedRecords: undefined,

        /**
         * @private
         * @cfg userAction {String} (Optional)
         * The client metrics action to record when the user makes a selection and clicks done
         */

        /**
         * @cfg showRadioButtons {Boolean}
         */
        showRadioButtons: true
    },

    constructor: function(config) {
        this.mergeConfig(config);

        this.callParent([this.config]);
    },

    selectionCache: [],

    initComponent: function() {
        this.callParent(arguments);

        this.addEvents(
            /**
             * @event artifactchosen
             * Fires when user clicks done after choosing an artifact
             * @param {Rally.ui.dialog.ArtifactChooserDialog} source the dialog
             * @param {Rally.data.wsapi.Model}| {Rally.data.wsapi.Model[]} selection selected record or an array of selected records if multiple is true
             */
            'itemschosen'
        );

        this.addCls(['chooserDialog', 'chooser-dialog']);
    },

    destroy: function() {
        //      this._destroyTooltip();
        this.callParent(arguments);
    },

    beforeRender: function() {
        this.callParent(arguments);

        this.addDocked({
            xtype: 'toolbar',
            dock: 'bottom',
            padding: '0 0 10 0',
            layout: {
                type: 'hbox',
                pack: 'center'
            },
            ui: 'footer',
            items: [
                {
                    xtype: 'rallybutton',
                    itemId: 'doneButton',
                    text: this.selectionButtonText,
                    cls: 'primary rly-small',
                    scope: this,
                    disabled: true,
                    userAction: 'clicked done in dialog',
                    handler: function() {
                        this.fireEvent('itemschosen', this.getSelectedRecords());
                        this.close();
                    }
                },
                {
                    xtype: 'rallybutton',
                    text: 'Cancel',
                    cls: 'secondary rly-small',
                    handler: this.close,
                    scope: this,
                    ui: 'link'
                }
            ]
        });

        if (this.introText) {
            this.addDocked({
                xtype: 'component',
                componentCls: 'intro-panel',
                html: this.introText
            });
        }

        this.addDocked({
            xtype: 'toolbar',
            itemId: 'searchBar',
            dock: 'top',
            border: false,
            padding: '0 0 10px 0',
            items: this.getSearchBarItems()
        });

        this.buildGrid();

        this.selectionCache = this.getInitialSelectedRecords() || [];
    },

    /**
     * Get the records currently selected in the dialog
     * {Rally.data.Model}|{Rally.data.Model[]}
     */
    getSelectedRecords: function() {
        return this.multiple ? this.selectionCache : this.selectionCache[0];
    },

    getSearchBarItems: function() {
        return [
            {
                xtype: 'triggerfield',
                cls: 'rui-triggerfield chooser-search-terms',
                emptyText: 'Search Keyword or ID',
                enableKeyEvents: true,
                flex: 1,
                itemId: 'searchTerms',
                listeners: {
                    keyup: function (textField, event) {
                        if (event.getKey() === Ext.EventObject.ENTER) {
                            this._search();
                        }
                    },
                    afterrender: function (field) {
                        field.focus();
                    },
                    scope: this
                },
                triggerBaseCls: 'icon-search chooser-search-icon'
            }
        ];
    },
    getStoreFilters: function() {
        return [];
    },

    buildGrid: function() {
        if (this.grid) {
            this.grid.destroy();
        }
        Ext.create('Rally.data.wsapi.ProjectTreeStoreBuilder').build({
            models: ['project'],
            autoLoad: true,
            enableHierarchy: true,
            filters: [{
                property: 'Parent',
                value: ""
            }]
        }).then({
            scope: this,
            success: function(store) {
                this.grid = this.add({
                    xtype: 'rallytreegrid',
                    treeColumnDataIndex: 'Name',
                    treeColumnHeader: 'Name',
                    enableRanking: false,
                    // enableEditing: false,
                    enableBulkEdit: false,
                    shouldShowRowActionsColumn: false,
                    selType: 'checkboxmodel',
                    selModel: {
                        //checkOnly: true,
                        injectCheckbox: 0,
                        mode: 'MULTI'
                    },
                    _defaultTreeColumnRenderer: function (value, metaData, record, rowIdx, colIdx, store) {
                        store = store.treeStore || store;
                        return Rally.ui.renderer.RendererFactory.getRenderTemplate(store.model.getField('Name')).apply(record.data);
                    },
                    columnCfgs: [],
                    store: store
                });

                this.mon(this.grid, {
                    beforeselect: this._onGridSelect,
                    beforedeselect: this._onGridDeselect,
                    load: this._onGridLoad,
                    scope: this
                });
                this.add(this.grid);
                this._onGridReady();
            }
        });
    },

    _enableDoneButton: function() {
        this.down('#doneButton').setDisabled(this.selectionCache.length ? false : true);
    },

    _findRecordInSelectionCache: function(record){
        return _.findIndex(this.selectionCache, function(cachedRecord) {
            return cachedRecord.get('_ref') === record.get('_ref');
        });
    },

    _onGridSelect: function(selectionModel, record) {
        var index = this._findRecordInSelectionCache(record);

        if (index === -1) {
            if (!this.multiple) {
                this.selectionCache = [];
            }
            this.selectionCache.push(record);
        }

        this._enableDoneButton();
    },

    _onGridDeselect: function(selectionModel, record) {
        var index = this._findRecordInSelectionCache(record);
        if (index !== -1) {
            this.selectionCache.splice(index, 1);
        }
        this._enableDoneButton();
    },

    _onGridReady: function() {
        if (!this.grid.rendered) {
            this.mon(this.grid, 'afterrender', this._onGridReady, this, {single: true});
            return;
        }

        if (this.grid.getStore().isLoading()) {
            this.mon(this.grid, 'load', this._onGridReady, this, {single: true});
            return;
        }

        this._onGridLoad();
        this.center();
    },
    _onGridLoad: function() {
        //console.log('_onGridLoad');
        var store = this.grid.store;
        var records = [];
        _.each(this.selectionCache, function(record) {
            var foundNode = store.getRootNode().findChild('_ref', record.get('_ref'),true);

            if (foundNode) {
                records.push(foundNode);
            }
        });
        if (records.length) {
            this.grid.getSelectionModel().select(records);
        }
    },
    _search: function() {
        var terms = this._getSearchTerms();
        var store = this.grid.getStore();
        //Filter functions call store load so we don't need to refresh the selections becuaes the
        //onGridLoad function will
        if (terms) {
            store.filter([
                Ext.create('Rally.data.wsapi.Filter',{
                    property: 'Name',
                    operator: 'contains',
                    value: terms
                })
            ]);
        } else {
            store.clearFilter();
        }

    },
    _getSearchTerms: function() {
        var textBox = this.down('#searchTerms');
        return textBox && textBox.getValue();
    }
});

Ext.override(Rally.data.wsapi.ParentChildMapper, {
    constructor: function() {
        this.parentChildTypeMap = {
            project: [{
                typePath: 'project', collectionName: 'Children', parentField: 'Parent'
            }],
            hierarchicalrequirement: [
                {typePath: 'defect', collectionName: 'Defects', parentField: 'Requirement'},
                {typePath: 'task', collectionName: 'Tasks', parentField: 'WorkProduct'},
                {typePath: 'testcase', collectionName: 'TestCases', parentField: 'WorkProduct'},
                {typePath: 'hierarchicalrequirement', collectionName: 'Children', parentField: 'Parent'}
            ],
            defect: [
                {typePath: 'task', collectionName: 'Tasks', parentField: 'WorkProduct'},
                {typePath: 'testcase', collectionName: 'TestCases', parentField: 'WorkProduct'}
            ],
            defectsuite: [
                {typePath: 'defect', collectionName: 'Defects', parentField: 'DefectSuites'},
                {typePath: 'task', collectionName: 'Tasks', parentField: 'WorkProduct'},
                {typePath: 'testcase', collectionName: 'TestCases', parentField: 'WorkProduct'}
            ],
            testset: [
                {typePath: 'task', collectionName: 'Tasks', parentField: 'WorkProduct'},
                {typePath: 'testcase', collectionName: 'TestCases', parentField: 'TestSets'}
            ]
        };
    }
});


Ext.define('Rally.data.wsapi.ProjectTreeStore', {

    // Client Metrics Note: WsapiTreeStore is too low level to record its load begins/ends. The problem is
    // client metrics can only reliably keep track of one load per component at a time. WsapiTreeStore makes
    // no guarantee that only one load will happen at a time. It's better to measure the component that is using
    // the store. All is not lost, the actual data requests that WsapiTreeStore makes *are* measured by client metrics.

    requires: [
        'Deft.promise.Deferred',
        'Rally.data.ModelFactory',
        'Rally.ui.grid.data.NodeInterface',
        'Rally.data.ModelTypes',
        'Rally.data.wsapi.ParentChildMapper'
    ],
    extend: 'Rally.data.wsapi.TreeStore',
    alias: 'store.rallyprojectwsapitreestore',

    /**
     * The type definition typePaths to render as root items (required)
     * @cfg {String[]} parentTypes
     */
    parentTypes: ['project'],

    /**
     * @property
     * @private
     */
    childLevelSorters: [{
        property: 'Name',
        direction: 'ASC'
    }],

    getParentFieldNamesByChildType: function(childType, parentType) {
        var model = this.model; //.getArtifactComponentModel(childType);
        return _.transform(this.mapper.getParentFields(childType, parentType), function(acc, field) {
            var typePath = field.typePath,
                fieldName = field.fieldName,
            // hasFieldModel = this.model.getArtifactComponentModel(typePath) || model.hasField(fieldName);
                hasFieldModel = model.hasField(fieldName);

            if (hasFieldModel) {
                acc.push(fieldName.replace(/\s+/g, ''));
            }
        }, [], this);
    },

    filter: function(filters) {
        this.fireEvent('beforefilter', this);
        //We need to clear the filters to remove the Parent filter
        this.filters.clear();
        this.filters.addAll(filters);
        this._resetCurrentPage();
        this.load();
    },

    clearFilter: function(suppressEvent) {
        this._resetCurrentPage();
        this.filters.clear();
        //We need to add the parent filter back in
        this.filters.addAll(Ext.create('Rally.data.wsapi.Filter',{
            property: 'Parent',
            value: ''
        }));

        if (!suppressEvent) {
            this.load();
        }
    }
});

Ext.define('Rally.data.wsapi.ProjectTreeStoreBuilder', {
    extend: 'Rally.data.wsapi.TreeStoreBuilder',

    build: function(config) {
        //A context needs to be passed in here, and it NEEDS to be a DataContext (context.getDataContext())
        //otherwise you will get a bunch of garbage on your WSAPI request

        config = _.clone(config || {});
        config.storeType = 'Rally.data.wsapi.ProjectTreeStore';

        return this.loadModels(config).then({
            success: function(models) {
                models = _.values(models);
                return this._buildStoreWithModels(models, config);
            },
            scope: this
        });
    }
});