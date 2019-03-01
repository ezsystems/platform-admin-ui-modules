import React, { Component } from 'react';
import PropTypes from 'prop-types';
import ContentTree from './components/content-tree/content.tree';
import { loadLocationItems, loadSubtree } from './services/content.tree.service';

const KEY_CONTENT_TREE_SUBTREE = 'ez-content-tree-subtree';

export default class ContentTreeModule extends Component {
    constructor(props) {
        super(props);

        this.setInitialItemsState = this.setInitialItemsState.bind(this);
        this.loadMoreSubitems = this.loadMoreSubitems.bind(this);
        this.updateSubtreeAfterItemToggle = this.updateSubtreeAfterItemToggle.bind(this);
        this.handleCollapseAllItems = this.handleCollapseAllItems.bind(this);

        const savedSubtree = localStorage.getItem(KEY_CONTENT_TREE_SUBTREE);

        this.items = props.preloadedLocations;
        this.subtree = savedSubtree ? JSON.parse(savedSubtree) : this.generateInitialSubtree();

        this.expandCurrentLocationInSubtree();
    }

    componentDidMount() {
        if (this.items.length) {
            this.subtree = this.generateSubtree(this.items);
            this.saveSubtree();

            return;
        }

        loadSubtree(this.props.restInfo, this.subtree, (loadedSubtree) => {
            this.setInitialItemsState(loadedSubtree[0]);
        });
    }

    setInitialItemsState(location) {
        this.items = [location];

        this.forceUpdate();
    }

    loadMoreSubitems({ parentLocationId, offset, limit, path }, successCallback) {
        loadLocationItems(
            this.props.restInfo,
            parentLocationId,
            this.updateLocationsStateAfterLoadingMoreItems.bind(this, path, successCallback),
            limit,
            offset
        );
    }

    updateLocationsStateAfterLoadingMoreItems(path, successCallback, location) {
        const item = this.findItem(this.items, path.split(','));

        if (!item) {
            return;
        }

        item.subitems = [...item.subitems, ...location.subitems];

        this.updateSubtreeAfterLoadMoreItems(path);
        successCallback();
        this.forceUpdate();
    }

    updateSubtreeAfterLoadMoreItems(path) {
        const item = this.findItem(this.items, path.split(','));

        this.updateItemInSubtree(this.subtree[0], item, path.split(','));
        this.saveSubtree();
    }

    updateSubtreeAfterItemToggle(path, isExpanded) {
        const item = this.findItem(this.items, path.split(','));

        if (isExpanded) {
            this.addItemToSubtree(this.subtree[0], item, path.split(','));
        } else {
            this.removeItemFromSubtree(this.subtree[0], item, path.split(','));
        }

        this.saveSubtree();
    }

    addItemToSubtree(subtree, item, path) {
        const parentSubtree = this.findParentSubtree(subtree, path);

        if (!parentSubtree) {
            return;
        }

        const { subitemsLoadLimit } = this.props;

        parentSubtree.children.push({
            '_media-type': 'application/vnd.ez.api.ContentTreeLoadSubtreeRequestNode',
            locationId: item.locationId,
            limit: Math.ceil(item.subitems.length / subitemsLoadLimit) * subitemsLoadLimit,
            offset: 0,
            children: [],
        });
    }

    removeItemFromSubtree(subtree, item, path) {
        const parentSubtree = this.findParentSubtree(subtree, path);

        if (!parentSubtree) {
            return;
        }

        const index = parentSubtree.children.findIndex((element) => element.locationId === item.locationId);

        if (index > -1) {
            parentSubtree.children.splice(index, 1);
        }
    }

    updateItemInSubtree(subtree, item, path) {
        const parentSubtree = this.findParentSubtree(subtree, path);

        if (!parentSubtree) {
            return;
        }

        const index = parentSubtree.children.findIndex((element) => element.locationId === item.locationId);

        if (index > -1) {
            parentSubtree.children[index].limit = item.subitems.length;
        }
    }

    saveSubtree() {
        localStorage.setItem(KEY_CONTENT_TREE_SUBTREE, JSON.stringify(this.subtree));
    }

    findParentSubtree(subtree, path) {
        if (path.length < 2) {
            return;
        }

        path.shift();
        path.pop();

        return path.reduce(
            (subtreeChild, locationId) => subtreeChild.children.find((element) => element.locationId === parseInt(locationId, 10)),
            subtree
        );
    }

    expandCurrentLocationInSubtree() {
        const { rootLocationId, currentLocationPath } = this.props;
        const path = currentLocationPath.split('/').filter((id) => !!id);
        const rootLocationIdIndex = path.findIndex((element) => parseInt(element, 10) === rootLocationId);

        if (rootLocationIdIndex === -1) {
            return;
        }

        const pathStartingAfterRootLocation = path.slice(rootLocationIdIndex - path.length + 1);

        this.expandPathInSubtree(this.subtree[0], pathStartingAfterRootLocation);
    }

    expandPathInSubtree(subtree, path) {
        if (!path.length) {
            return;
        }

        const locationId = parseInt(path[0], 10);
        let nextSubtree = subtree.children.find((element) => element.locationId === locationId);

        if (!nextSubtree) {
            nextSubtree = {
                '_media-type': 'application/vnd.ez.api.ContentTreeLoadSubtreeRequestNode',
                locationId: locationId,
                limit: this.props.subitemsLoadLimit,
                offset: 0,
                children: [],
            };
            subtree.children.push(nextSubtree);
        }

        path.shift();
        this.expandPathInSubtree(nextSubtree, path);
    }

    generateInitialSubtree() {
        return [
            {
                '_media-type': 'application/vnd.ez.api.ContentTreeLoadSubtreeRequestNode',
                locationId: this.props.rootLocationId,
                limit: this.props.subitemsLoadLimit,
                offset: 0,
                children: [],
            },
        ];
    }

    generateSubtree(items) {
        const itemsWithoutLeafs = [];
        const { subitemsLoadLimit } = this.props;

        for (const item of items) {
            const isLeaf = !item.subitems.length;

            if (!isLeaf) {
                itemsWithoutLeafs.push({
                    '_media-type': 'application/vnd.ez.api.ContentTreeLoadSubtreeRequestNode',
                    locationId: item.locationId,
                    limit: Math.ceil(item.subitems.length / subitemsLoadLimit) * subitemsLoadLimit,
                    offset: 0,
                    children: this.generateSubtree(item.subitems),
                });
            }
        }

        return itemsWithoutLeafs;
    }

    findItem(items, path) {
        const isLast = path.length === 1;
        const item = items.find((element) => element.locationId === parseInt(path[0], 10));

        if (!item) {
            return null;
        }

        if (isLast) {
            return item;
        }

        if (!(item.hasOwnProperty('subitems') && Array.isArray(item.subitems))) {
            return null;
        }

        path.shift();

        return this.findItem(item.subitems, path);
    }

    getCurrentLocationId() {
        const currentLocationIdString = this.props.currentLocationPath
            .split('/')
            .filter((id) => !!id)
            .pop();

        return parseInt(currentLocationIdString, 10);
    }

    handleCollapseAllItems() {
        this.items = [];
        this.forceUpdate();

        this.subtree = this.generateInitialSubtree();
        this.saveSubtree();

        loadSubtree(this.props.restInfo, this.subtree, (loadedSubtree) => {
            this.setInitialItemsState(loadedSubtree[0]);
        });
    }

    render() {
        const { subitemsLoadLimit } = this.props;
        const attrs = {
            items: this.items,
            currentLocationId: this.getCurrentLocationId(),
            subitemsLoadLimit,
            loadMoreSubitems: this.loadMoreSubitems,
            afterItemToggle: this.updateSubtreeAfterItemToggle,
            onCollapseAppItems: this.handleCollapseAllItems,
        };

        return <ContentTree {...attrs} />;
    }
}

eZ.addConfig('modules.ContentTree', ContentTreeModule);

ContentTreeModule.propTypes = {
    rootLocationId: PropTypes.number.isRequired,
    currentLocationPath: PropTypes.number.isRequired,
    preloadedLocations: PropTypes.arrayOf(PropTypes.object),
    subitemsLoadLimit: PropTypes.number,
    restInfo: PropTypes.shape({
        token: PropTypes.string.isRequired,
        siteaccess: PropTypes.string.isRequired,
    }).isRequired,
};

ContentTreeModule.defaultProps = {
    rootLocationId: 2,
    preloadedLocations: [],
    subitemsLoadLimit: 10,
};
