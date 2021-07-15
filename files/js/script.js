/* globals apex */

var FOS = window.FOS || {};
FOS.utils = window.FOS.utils || {};

/**
 * This function evaluates the given parameters (the clientside condition) and stops the current dynamic actions
 * if the condition demands so.
 *
 * @param {object}   daContext                      Dynamic Action context as passed in by APEX.
 * @param {object}   config                         The configuration object holding the clientside condition.
 * @param {string}   config.mode                    Defines whether to sort or to swap elements.
 * @param {string}   config.action                  The action to be called when an element has been dragged/dropped.
 * @param {string}   config.itemsToSubmit           APEX page items to submit when executing pl/sql code on sequence update.
 * @param {string}   config.groupSelector           Selector (within the affected region) to choose the group of draggable elements, default is 'ul'.
 * @param {string}   config.itemSelector            Selector (within the group) to choose the draggable elements, default is 'li'.
 * @param {string}   config.handle                  Selector (within the item) to choose a sub element within the itemSelector to control dragging, default is null.
 * @param {number}   [config.distance]              The distance the cursor has to move before the drag starts, defaults to 5.
 * @param {function} [config.dataIdFn]              Function to return the elements id. If not specified the item's dataset.id is used
 * @param {function} [initFn]                       Javascript initialization function which allows you to override any settings right before the button is created
 */
FOS.utils.enableDragDrop = function (daContext, config, initFn) {

    const pluginName = 'FOS - Enable Drag and Drop';
    apex.debug.info(pluginName, config, initFn);

    // Allow the developer to perform any last (centralized) changes using Javascript Initialization Code
    if (initFn instanceof Function) {
        initFn.call(daContext, config);
        apex.debug.info('Updated config by init-js-function', config);
    }
    FOS.utils.dragger = FOS.utils.dragger || {};
    let mode = config.mode;
    let useSimplePlaceholder = true; //!!config.useSimplePlaceholder;
    let simplePlaceholderColor = config.simplePlaceholderColor || '#ccc';
    let ajaxId = config.ajaxId;
    let regionId = daContext.affectedElements[0].id;
    let groupEl = document.querySelector(`#${regionId} ${config.groupSelector}`);
    let dataIdFn;
    let distance = parseInt(config.distance);
    distance = distance === distance ? distance : 5;

    if (!groupEl) {
        apex.debug.error('Draggable Group not found - check your selector');
        return;
    }

    // is there an override of the data-id function, or should we use our default (dataset.id) ?
    if (config.dataIdFn instanceof Function) {
        dataIdFn = config.dataIdFn;
    } else {
        dataIdFn = function (item) { return item.dataset.id };
    }

    let order = Array.from(groupEl.querySelectorAll(config.itemSelector)).map(item => dataIdFn(item));
    let dragger;
    let resumeCallback = daContext.resumeCallback;

    // destroy the previous dragger (if it was previously setup e.g. for IG Page Change)
    if (FOS.utils.dragger[regionId]) {
        FOS.utils.dragger[regionId].destroy();
    }

    apex.debug.info('init order', order);

    if (mode == 'swap') {
        let draggedElementId;
        let swappedElementId;
        let draggedOriginalIndex;
        let draggedCurrentIndex;
        let o; // temporal array for swapping which will be used to compare with the original order in swap:stop

        dragger = new Draggable.Swappable(groupEl, {
            draggable: config.itemSelector,
            distance,
            plugins: [Draggable.Plugins.SwapAnimation],
            mirror: {
                constrainDimensions: true
            }
        });

        FOS.utils.dragger[regionId] = dragger;

        dragger.on('swappable:start', e => {
            draggedElementId = dataIdFn(e.data.dragEvent.originalSource);
            draggedOriginalIndex = order.indexOf(draggedElementId);
            draggedCurrentIndex = draggedOriginalIndex;
            o = [...order];
        });

        // we cannot get the change in the :stop event :(, we need to get it in :swapped
        dragger.on('swappable:swapped', e => {
            swappedElementId = dataIdFn(e.data.swappedElement);
            o = [...order];
            let swappedIndex = o.indexOf(swappedElementId);
            let swappedValue = o[swappedIndex];

            // if it is 1 step away from its initial position, we must check whether it's not returning
            // to its initial position
            if (draggedOriginalIndex == draggedCurrentIndex - 1 || draggedOriginalIndex == draggedCurrentIndex + 1) {
                // item to the left in the original array
                if (draggedOriginalIndex > 0 && order[draggedOriginalIndex - 1] == swappedValue) {
                    o = order;
                }
                // item to the right in the original array
                else if (draggedOriginalIndex < (order.length - 1) && order[draggedOriginalIndex + 1] == swappedValue) {
                    o = order;
                }
                // not returning, just proceed normally
                else {
                    o[swappedIndex] = draggedElementId;
                    o[draggedOriginalIndex] = swappedValue;
                }
            }
            else {
                o[swappedIndex] = draggedElementId;
                o[draggedOriginalIndex] = swappedValue;
            }

            draggedCurrentIndex = o.indexOf(draggedElementId);
        });

        dragger.on('swappable:stop', e => {
            // we need to compare the arrays as we don't get any info in this event
            for (let i = 0; i < o.length; i++) {
                if (o[i] !== order[i]) {
                    updateSequence({ swapped: { dragId: o[i], dropId: order[i] }, sequence: { before: order, after: o } });
                    order = o;
                    break;
                }
            }
        });
    }
    else {

        dragger = new Draggable.Sortable(groupEl, {
            draggable: config.itemSelector,
            plugins: [Draggable.Plugins.SortAnimation],
            handle: config.handle,
            distance,
            mirror: {
                constrainDimensions: true
            }
        });

        FOS.utils.dragger[regionId] = dragger;

        dragger.on('sortable:stop', e => {
            let data = e.data;
            let newIndex = data.newIndex;
            let oldIndex = data.oldIndex;
            let oldOrder = [...order];

            // if the indexes are the same, no reorder took place
            if (oldIndex === newIndex) return;

            // otherwise move the item and save the new order
            arrayMove(order, oldIndex, newIndex, true);

            updateSequence({ sorted: { dragId: oldOrder[oldIndex], dropId: oldOrder[newIndex] }, sequence: { before: oldOrder, after: order } });
        });
    }
    if (useSimplePlaceholder) {
        dragger.on('mirror:created', e => {
            let data = e.data;
            let source = data.source;
            source.style.setProperty('background-color', simplePlaceholderColor, 'important');
            Array.from(source.children).forEach(c => {
                c.style.opacity = 0;
            });
        });
    }

    /* Moves an item inside the array from index to index */
    function arrayMove(arr, fromIndex, toIndex, inPlace = false) {
        if (!inPlace) arr = [...arr];
        let element = arr[fromIndex];
        arr.splice(fromIndex, 1);
        arr.splice(toIndex, 0, element);
        return arr;
    }

    function copyNodeStyle(sourceNode, targetNode) {
        let computedStyle = getComputedStyle(sourceNode);
        Array.from(computedStyle).forEach(function (key) {
            return targetNode.style.setProperty(key, computedStyle.getPropertyValue(key), computedStyle.getPropertyPriority(key));
        });
    }

    /* triggered by dropping an element, if sequence has changed it will raise an event and run some PL/SQL code */
    function updateSequence(updateJson) {
        apex.debug.info('Sequence updated', updateJson);

        apex.event.trigger(daContext.affectedElements, 'fos-enabledraganddrop-sequence-update', updateJson);

        if (config.action === 'plsql') {
            updateJson.sequence.before = updateJson.sequence.before.join(":");
            updateJson.sequence.after = updateJson.sequence.after.join(":");
            // run the pl/sql code in the database
            let result = apex.server.plugin(ajaxId, {
                p_clob_01: JSON.stringify(updateJson),
                pageItems: config.itemsToSubmit
            }, {
                dataType: 'json',
                target: daContext.browserEvent.target
            });

            // handle ajax result using our result promise
            result.done(function (data) {
                apex.event.trigger(daContext.affectedElements, 'fos-enabledraganddrop-update-complete', updateJson);
            }).fail(function (jqXHR, textStatus, errorThrown) {
                apex.da.handleAjaxErrors(jqXHR, textStatus, errorThrown, resumeCallback);
            });
        } else if (config.action === 'javascript') {
            window[config.jsFn].call(this, updateJson);
        }
    }
};


