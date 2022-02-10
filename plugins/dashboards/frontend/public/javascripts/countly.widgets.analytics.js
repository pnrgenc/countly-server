/*global countlyVue, CV, countlyGlobal */

(function() {
    var WidgetComponent = countlyVue.views.create({
        template: CV.T('/dashboards/templates/widgets/analytics/widget.html'),
        props: {
            data: {
                type: Object,
                default: function() {
                    return {};
                }
            }
        },
        data: function() {
            return {
                selectedBucket: "daily"
            };
        },
        computed: {
            title: function() {
                var autoTitle = "Analytics";
                return this.data.title || autoTitle;
            },
            period: function() {
                return this.data.custom_period || "";
            },
            showBuckets: function() {
                return false;
            },
            apps: function() {
                var apps = this.data.apps;
                var appData = [];

                for (var i = 0; i < apps.length; i++) {
                    var appId = apps[i];
                    appData.push({
                        id: appId,
                        name: this.getAppName(appId)
                    });
                }
            },
            timelineGraph: function() {
                this.data = this.data || {};
                this.data.dashData = this.data.dashData || {};
                this.data.dashData.data = this.data.dashData.data || {};

                var legend = {"type": "primary", data: []};
                var series = [];
                var appIndex = 0;
                for (var app in this.data.dashData.data) {
                    var name = countlyGlobal.apps[app].name || "";
                    for (var k = 0; k < this.data.metrics.length; k++) {

                        series.push({ "data": [], "name": this.data.metrics[k] + " " + name, "app": app, "metric": this.data.metrics[k]});
                        legend.data.push({"name": this.data.metrics[k] + " " + name, "app": app, "metric": this.data.metrics[k]});
                    }
                    for (var date in this.data.dashData.data[app]) {
                        for (var kk = 0; kk < this.data.metrics.length; kk++) {
                            series[appIndex * this.data.metrics.length + kk].data.push(this.data.dashData.data[app][date][this.data.metrics[kk]] || 0);
                        }
                    }
                    appIndex++;
                }
                return {
                    lineOptions: {"series": series},
                    lineLegend: legend
                };
            },
            number: function() {
                this.data = this.data || {};
                this.data.dashData = this.data.dashData || {};
                var value;
                this.data.dashData.data = this.data.dashData.data || {};
                for (var app in this.data.dashData.data) {
                    value = this.data.dashData.data[app];
                }
                return value;
            }

        },
        methods: {
            beforeCopy: function(data) {
                return data;
            }
        }
    });

    var DrawerComponent = countlyVue.views.create({
        template: CV.T('/dashboards/templates/widgets/analytics/drawer.html'),
        props: {
            scope: {
                type: Object
            }
        },
        data: function() {
            return {
                metricLists: {
                    "session": [
                        { label: this.i18n("common.total-sessions"), value: "t" },
                        { label: this.i18n("common.unique-sessions"), value: "u" },
                        { label: this.i18n("common.new-sessions"), value: "n" }
                    ]
                }
            };
        },
        computed: {
            enabledVisualizationTypes: function() {
                if (this.scope.editedObject.app_count === 'single') {
                    return ['time-series', 'bar-chart', 'number'];
                }
                else if (this.scope.editedObject.app_count === 'multiple') {
                    return ['time-series', 'bar-chart'];
                }
                else {
                    return [];
                }
            },
            isMultipleMetric: function() {
                var multiple = false;
                var appCount = this.scope.editedObject.app_count;
                var visualization = this.scope.editedObject.visualization;

                if (appCount === 'single') {
                    if (visualization === 'bar-chart' || visualization === 'time-series') {
                        multiple = true;
                    }
                }

                return multiple;
            },
            metrics: function() {
                return this.metricLists[this.scope.editedObject.data_type];
            },
            showBreakdown: function() {
                if (this.scope.editedObject.visualization === 'bar-chart') {
                    return true;
                }
                else {
                    return false;
                }
            },
            showPeriod: function() {
                return true;
            }
        }
    });

    /**
     * Set primary: true since Analytics widget can have multiple registrations of
     * type analytics. But among all of them only one should be primary.
     * We have chosen Analytics widget with data_type = session to be primary.
     * For other registrations of type analytics, we set primary: false.
     *
     * Set getter to return this widget registration object.
     * The returned value should be a boolean.
     * It should be something unique for each widget registration.
     * Getter accepts the widget data object as an argument.
     * Based on the data you can decide if this registration should be returned or not.
     * Please don't mutate the widget data object passed in the argument to the getter.
     */
    countlyVue.container.registerData("/custom/dashboards/widget", {
        type: "analytics",
        label: CV.i18nM("dashboards.widget-type.analytics"),
        priority: 1,
        primary: true,
        getter: function(widget) {
            return widget.widget_type === "analytics" && widget.data_type === "session";
        },
        drawer: {
            component: DrawerComponent,
            getEmpty: function() {
                return {
                    title: "",
                    widget_type: "analytics",
                    app_count: 'single',
                    data_type: "session",
                    metrics: [],
                    apps: [],
                    visualization: "",
                    breakdowns: [],
                    custom_period: null
                };
            },
            beforeSaveFn: function(doc) {
                /**
                 * Sanitize the widget object before saving on the server
                 */
                if (["bar-chart", "table"].indexOf(doc.visualization) === -1) {
                    delete doc.breakdowns;
                }
            }
        },
        grid: {
            component: WidgetComponent,
            dimensions: function() {
                return {
                    minWidth: 2,
                    minHeight: 4,
                    width: 2,
                    height: 4
                };
            },
            onClick: function() {}
        }
    });
})();